use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{AppHandle, Emitter, Listener, Manager};

static WINDOW_COUNTER: AtomicUsize = AtomicUsize::new(0);

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
fn resolve_path(base_dir: String, relative: String) -> String {
    let base = Path::new(&base_dir);
    let resolved = base.join(&relative);
    resolved.to_string_lossy().to_string()
}

fn open_file_in_new_window(app: &AppHandle, file_path: &str) {
    let count = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let label = format!("viewer-{}", count);
    let encoded_path = urlencoding::encode(file_path);
    let url = format!("index.html?file={}", encoded_path);

    let filename = Path::new(file_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "emdee".to_string());

    let title = format!("emdee — {}", filename);

    let _window = tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App(url.into()))
        .title(&title)
        .inner_size(960.0, 720.0)
        .min_inner_size(480.0, 360.0)
        .build();
}

fn is_markdown_file(path: &str) -> bool {
    let p = Path::new(path);
    match p.extension().and_then(|e| e.to_str()) {
        Some(ext) => matches!(
            ext.to_lowercase().as_str(),
            "md" | "markdown" | "mdown" | "mkd" | "mdx"
        ),
        None => false,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![read_file, resolve_path])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Handle CLI args (Windows/Linux file association, or direct CLI invocation)
            let args: Vec<String> = std::env::args().collect();
            let mut opened_file = false;
            for arg in args.iter().skip(1) {
                if is_markdown_file(arg) {
                    let abs_path = if Path::new(arg).is_absolute() {
                        PathBuf::from(arg)
                    } else {
                        std::env::current_dir()
                            .unwrap_or_default()
                            .join(arg)
                    };
                    let path_str = abs_path.to_string_lossy().to_string();

                    // For the first file, load it in the main window via event
                    if !opened_file {
                        let main_window = app.get_webview_window("main");
                        if let Some(win) = main_window {
                            let _ = win.emit("open-file", &path_str);
                            let filename = abs_path
                                .file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_else(|| "emdee".to_string());
                            let _ = win.set_title(&format!("emdee — {}", filename));
                        }
                        opened_file = true;
                    } else {
                        open_file_in_new_window(app.handle(), &path_str);
                    }
                }
            }

            // macOS: handle files opened via Finder "Open With" / drag onto dock icon
            #[cfg(target_os = "macos")]
            {
                let handle = app.handle().clone();
                // Listen for file-drop events from the OS
                app.listen("tauri://file-drop", move |event| {
                    let payload = event.payload();
                    if let Ok(paths) = serde_json::from_str::<Vec<String>>(payload) {
                        for path in paths {
                            if is_markdown_file(&path) {
                                open_file_in_new_window(&handle, &path);
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
