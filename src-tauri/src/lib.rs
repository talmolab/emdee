use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Listener, Manager};

#[cfg(target_os = "macos")]
mod pdf;

static WINDOW_COUNTER: AtomicUsize = AtomicUsize::new(0);

/// Holds the file path passed via CLI args for the main window to pick up once loaded.
struct InitialFile(Mutex<Option<String>>);

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

/// Called by the frontend on init to check if a file was passed via CLI args.
#[tauri::command]
fn get_initial_file(state: tauri::State<'_, InitialFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

/// Export the current webview content as a PDF file.
#[cfg(target_os = "macos")]
#[tauri::command]
async fn export_pdf(window: tauri::WebviewWindow, output_path: String) -> Result<(), String> {
    pdf::export_pdf(window, output_path).await
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(InitialFile(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![read_file, resolve_path, get_initial_file, export_pdf])
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
            let mut first_file = true;
            for arg in args.iter().skip(1) {
                if is_markdown_file(arg) {
                    let abs_path = if Path::new(arg).is_absolute() {
                        PathBuf::from(arg)
                    } else {
                        // Try cwd first, then parent of cwd (handles cargo tauri dev
                        // where cwd is src-tauri/ but the file is in the project root)
                        let cwd = std::env::current_dir().unwrap_or_default();
                        let candidate = cwd.join(arg);
                        if candidate.exists() {
                            candidate
                        } else if let Some(parent) = cwd.parent() {
                            let parent_candidate = parent.join(arg);
                            if parent_candidate.exists() {
                                parent_candidate
                            } else {
                                candidate // fall back to original
                            }
                        } else {
                            candidate
                        }
                    };
                    let path_str = abs_path.to_string_lossy().to_string();

                    if first_file {
                        // Store for the main window to pick up via get_initial_file command
                        let state = app.state::<InitialFile>();
                        *state.0.lock().unwrap() = Some(path_str);
                        first_file = false;
                    } else {
                        open_file_in_new_window(app.handle(), &path_str);
                    }
                }
            }

            // macOS: handle files opened via Finder "Open With" / drag onto dock icon
            #[cfg(target_os = "macos")]
            {
                let handle = app.handle().clone();
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
