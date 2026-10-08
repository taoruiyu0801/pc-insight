use crate::{
    runtime::{now, BrowserSnapshot},
    Shared,
};
use serde::Deserialize;
use std::io::Read;
use tiny_http::{Header, Method, Response, Server};

#[derive(Deserialize)]
struct Payload {
    url: String,
    title: String,
    browser: String,
    #[serde(default)]
    active: bool,
    #[serde(default)]
    incognito: bool,
}

fn allowed_origin(origin: &str) -> bool {
    let id = origin.strip_prefix("chrome-extension://").unwrap_or("");
    id.len() == 32 && id.bytes().all(|b| (b'a'..=b'p').contains(&b))
}

pub fn start(state: Shared) {
    std::thread::spawn(move || {
        let server = match Server::http("127.0.0.1:47831") {
            Ok(s) => s,
            Err(e) => {
                if let Ok(mut r) = state.lock() {
                    r.bridge_error = Some(format!("浏览器端口不可用：{e}"));
                }
                return;
            }
        };
        if let Ok(mut r) = state.lock() {
            r.bridge_ready = true;
        }
        for mut request in server.incoming_requests() {
            let header = |name: &str| {
                request
                    .headers()
                    .iter()
                    .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name))
                    .map(|h| h.value.as_str().to_string())
                    .unwrap_or_default()
            };
            let origin = header("Origin");
            let host = header("Host");
            let auth = header("Authorization");
            let allowed =
                allowed_origin(&origin) && host == "127.0.0.1:47831" && request.url() == "/browser";
            let cors =
                || Header::from_bytes("Access-Control-Allow-Origin", origin.as_bytes()).unwrap();
            if !allowed {
                let _ = request.respond(Response::from_string("Forbidden").with_status_code(403));
                continue;
            }
            if request.method() == &Method::Options {
                let _ = request.respond(
                    Response::empty(204)
                        .with_header(cors())
                        .with_header(
                            Header::from_bytes("Access-Control-Allow-Methods", "POST, OPTIONS")
                                .unwrap(),
                        )
                        .with_header(
                            Header::from_bytes(
                                "Access-Control-Allow-Headers",
                                "Content-Type, Authorization",
                            )
                            .unwrap(),
                        ),
                );
                continue;
            }
            if request.method() != &Method::Post {
                let _ = request.respond(Response::empty(405).with_header(cors()));
                continue;
            }
            let authenticated = state
                .lock()
                .ok()
                .and_then(|r| r.store.settings().ok())
                .is_some_and(|s| auth == format!("Bearer {}", s.browser_token));
            if !authenticated {
                let _ = request.respond(Response::empty(401).with_header(cors()));
                continue;
            }
            if request.body_length().is_none_or(|n| n > 8192) {
                let _ = request.respond(Response::empty(413).with_header(cors()));
                continue;
            }
            let mut body = String::new();
            let valid = request
                .as_reader()
                .take(8193)
                .read_to_string(&mut body)
                .is_ok()
                && body.len() <= 8192;
            let payload = if valid {
                serde_json::from_str::<Payload>(&body).ok()
            } else {
                None
            };
            let code = if let Some(p) = payload {
                if !["chrome.exe", "msedge.exe", "brave.exe"].contains(&p.browser.as_str())
                    || p.title.len() > 2048
                {
                    400
                } else {
                    if let Ok(mut r) = state.lock() {
                        if !r.recording || !p.active || p.incognito {
                            r.browser = None;
                        } else {
                            r.browser = pc_activitywatch::sanitize_domain(&p.url).map(|domain| {
                                BrowserSnapshot {
                                    domain,
                                    title: p.title,
                                    browser: p.browser,
                                    received: now(),
                                }
                            });
                        }
                    }
                    204
                }
            } else {
                400
            };
            let _ = request.respond(Response::empty(code).with_header(cors()));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pages_cannot_access_bridge() {
        assert!(!allowed_origin("https://example.com"));
        assert!(!allowed_origin("chrome-extension://evil.example"));
        assert!(allowed_origin(
            "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
        ));
    }
}
