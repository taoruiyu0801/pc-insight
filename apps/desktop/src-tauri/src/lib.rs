mod activitywatch;
mod bridge;
mod commands;
mod runtime;

use runtime::Runtime;
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

pub type Shared = Arc<Mutex<Runtime>>;

pub fn run() {
    if std::env::args().any(|a| a == "--smoke-test") {
        runtime::smoke_test();
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .setup(|app| {
            let validation=std::env::args().any(|a|a=="--verify-startup");
            let path = if validation {std::env::current_dir()?.join(".tools").join(format!("startup-validation-{}",runtime::id()))} else {app.path().app_data_dir()?};
            std::fs::create_dir_all(&path)?;
            let state = Arc::new(Mutex::new(
                Runtime::new(path.join("activity.db"))
                    .map_err(|e| std::io::Error::other(e.to_string()))?,
            ));
            app.manage(state.clone());
            if validation {
                if let Some(w)=app.get_webview_window("main"){let _=w.hide();}
                let handle=app.handle().clone();let check=state.clone();let root=std::env::current_dir()?;
                std::thread::spawn(move||{
                    let mut ready=false;
                    for _ in 0..40 {std::thread::sleep(std::time::Duration::from_millis(500));if check.lock().is_ok_and(|r|r.snapshot_calls>0){ready=true;break;}}
                    let out=root.join("artifacts");let _=std::fs::create_dir_all(&out);
                    let _=std::fs::write(out.join("startup-smoke.json"),serde_json::to_string_pretty(&serde_json::json!({"embeddedWebviewIpcReady":ready,"recordingStarted":false,"isolatedDatabase":true})).unwrap());
                    handle.exit(if ready {0} else {1});
                });
            }
            runtime::start(state.clone());
            bridge::start(state.clone());
            activitywatch::start(state.clone());
            let show = MenuItem::with_id(app, "show", "打开 PC Insight", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "开始 / 暂停记录", true, None::<&str>)?;
            let widget = MenuItem::with_id(app, "widget", "显示 / 隐藏悬浮窗", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &pause, &widget, &quit])?;
            // The tray uses the bundled app icon (icons/icon.ico), so both stay in sync.
            let tray_icon = app
                .default_window_icon()
                .cloned()
                .ok_or("missing default window icon")?;
            TrayIconBuilder::new()
                .icon(tray_icon)
                .tooltip("PC Insight · 本地工作记录")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "pause" => {
                        let s = app.state::<Shared>();
                        let result = s.lock().map_err(|e|e.to_string()).and_then(|mut r| { let next=!r.recording; r.set_recording(next,false,false).map_err(|e|e.to_string()) });
                        match result {
                            Ok(false) => { let _=commands::request_recording(app.clone()); }
                            Err(error) => { let _=commands::show_dashboard(app.clone()); let _=app.emit("recording-error",error); }
                            _ => {}
                        }
                    }
                    "widget" => {
                        // Off the menu-event (main) thread for the same reason as the command.
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = commands::toggle_widget(app).await;
                        });
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::snapshot,
            commands::set_recording,
            commands::set_intent,
            commands::request_recording,
            commands::preview_corrections,
            commands::commit_corrections,
            commands::undo_correction,
            commands::correction_history,
            commands::test_keywords,
            commands::save_project,
            commands::save_rule,
            commands::delete_rule,
            commands::correct_activity,
            commands::save_settings,
            commands::start_job,
            commands::finish_job,
            commands::import_activitywatch,
            commands::toggle_widget,
            commands::show_dashboard,
            commands::autostart_status,
            commands::set_autostart
        ])
        .run(tauri::generate_context!())
        .expect("PC Insight could not start");
}
