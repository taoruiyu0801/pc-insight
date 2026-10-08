use pc_domain::Settings;

#[derive(Debug, Clone)]
pub struct WindowInfo {
    pub process: String,
    pub title: String,
    pub area: f64,
    pub foreground: bool,
}
#[derive(Debug, Clone)]
pub struct Sample {
    pub windows: Vec<WindowInfo>,
    pub idle_ms: u64,
}

pub fn excluded(window: &WindowInfo, settings: &Settings) -> bool {
    settings
        .excluded_apps
        .iter()
        .filter(|s| !s.trim().is_empty())
        .any(|s| window.process.to_lowercase().contains(&s.to_lowercase()))
        || settings
            .excluded_titles
            .iter()
            .filter(|s| !s.trim().is_empty())
            .any(|s| window.title.to_lowercase().contains(&s.to_lowercase()))
}

#[cfg(not(windows))]
pub fn sample() -> Result<Sample, String> {
    Err("采集仅支持 Windows".into())
}

#[cfg(windows)]
pub fn sample() -> Result<Sample, String> {
    platform::sample()
}

#[cfg(windows)]
mod platform {
    use super::*;
    use windows_sys::Win32::{
        Foundation::*,
        Graphics::Dwm::*,
        System::{SystemInformation::GetTickCount, Threading::*},
        UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
    };
    type Rect = (i32, i32, i32, i32);
    fn intersect(a: Rect, b: Rect) -> Option<Rect> {
        let r = (a.0.max(b.0), a.1.max(b.1), a.2.min(b.2), a.3.min(b.3));
        (r.2 > r.0 && r.3 > r.1).then_some(r)
    }
    fn subtract(a: Rect, b: Rect) -> Vec<Rect> {
        let Some(i) = intersect(a, b) else {
            return vec![a];
        };
        [
            (a.0, a.1, a.2, i.1),
            (a.0, i.3, a.2, a.3),
            (a.0, i.1, i.0, i.3),
            (i.2, i.1, a.2, i.3),
        ]
        .into_iter()
        .filter(|r| r.2 > r.0 && r.3 > r.1)
        .collect()
    }
    struct EnumState {
        foreground: HWND,
        screen: Rect,
        covered: Vec<Rect>,
        windows: Vec<WindowInfo>,
    }
    unsafe fn info(hwnd: HWND) -> (String, String) {
        let mut title = vec![0u16; 2048];
        let n = GetWindowTextW(hwnd, title.as_mut_ptr(), title.len() as i32).max(0) as usize;
        let title = String::from_utf16_lossy(&title[..n]);
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        let process = if !handle.is_null() {
            let mut buf = vec![0u16; 32768];
            let mut size = buf.len() as u32;
            let success = QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut size);
            CloseHandle(handle);
            if success != 0 {
                String::from_utf16_lossy(&buf[..size as usize])
                    .rsplit('\\')
                    .next()
                    .unwrap_or("unknown")
                    .to_string()
            } else {
                "unknown".into()
            }
        } else {
            "unknown".into()
        };
        (process, title)
    }
    unsafe extern "system" fn enumerate(hwnd: HWND, lparam: LPARAM) -> i32 {
        let state = &mut *(lparam as *mut EnumState);
        if IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
            return 1;
        }
        let mut cloaked = 0u32;
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED as u32,
            &mut cloaked as *mut _ as *mut _,
            4,
        );
        if cloaked != 0 {
            return 1;
        }
        let mut r = RECT::default();
        if GetWindowRect(hwnd, &mut r) == 0 {
            return 1;
        }
        let Some(rect) = intersect((r.left, r.top, r.right, r.bottom), state.screen) else {
            return 1;
        };
        let mut exposed = vec![rect];
        for blocker in &state.covered {
            exposed = exposed
                .into_iter()
                .flat_map(|p| subtract(p, *blocker))
                .collect();
            if exposed.is_empty() {
                break;
            }
        }
        state.covered.push(rect);
        let total =
            (state.screen.2 - state.screen.0) as f64 * (state.screen.3 - state.screen.1) as f64;
        let area = exposed
            .iter()
            .map(|r| (r.2 - r.0) as f64 * (r.3 - r.1) as f64)
            .sum::<f64>()
            / total.max(1.0);
        let foreground = hwnd == state.foreground;
        if (area >= 0.01 && state.windows.len() < 16) || foreground {
            let (process, title) = info(hwnd);
            if !title.is_empty() || foreground {
                state.windows.push(WindowInfo {
                    process,
                    title,
                    area,
                    foreground,
                });
            }
        }
        1
    }
    pub fn sample() -> Result<Sample, String> {
        unsafe {
            let foreground = GetForegroundWindow();
            if foreground.is_null() {
                return Err("屏幕已锁定或当前没有可读取的前台窗口".into());
            }
            let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
            let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
            let w = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            let h = GetSystemMetrics(SM_CYVIRTUALSCREEN);
            let mut state = EnumState {
                foreground,
                screen: (x, y, x + w, y + h),
                covered: vec![],
                windows: vec![],
            };
            EnumWindows(Some(enumerate), &mut state as *mut _ as LPARAM);
            if !state.windows.iter().any(|w| w.foreground) {
                let (process, title) = info(foreground);
                state.windows.push(WindowInfo {
                    process,
                    title,
                    area: 1.0,
                    foreground: true,
                });
            }
            let mut input = LASTINPUTINFO {
                cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
                dwTime: 0,
            };
            if GetLastInputInfo(&mut input) == 0 {
                return Err("无法读取最后输入时间".into());
            }
            Ok(Sample {
                windows: state.windows,
                idle_ms: GetTickCount().wrapping_sub(input.dwTime) as u64,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn empty_exclusions_do_not_exclude_everything() {
        let mut s = Settings::default();
        s.excluded_apps = vec!["".into()];
        let w = WindowInfo {
            process: "code.exe".into(),
            title: "normal".into(),
            area: 1.0,
            foreground: true,
        };
        assert!(!excluded(&w, &s));
        s.excluded_apps = vec!["CODE".into()];
        assert!(excluded(&w, &s));
    }
}
