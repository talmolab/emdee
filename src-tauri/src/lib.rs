use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

mod cli_path;

#[cfg(target_os = "macos")]
mod pdf;

#[cfg(target_os = "windows")]
mod pdf_windows;

static WINDOW_COUNTER: AtomicUsize = AtomicUsize::new(0);

/// Holds the file path passed via CLI args for the main window to pick up once loaded.
struct InitialFile(Mutex<Option<String>>);

/// Per-window file watchers for live reload. Keyed by window label.
struct FileWatchers(
    Mutex<HashMap<String, notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>>>,
);

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

/// Start watching a file for changes. Emits "file-changed" to the calling window on modification.
#[tauri::command]
fn watch_file(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, FileWatchers>,
    path: String,
) -> Result<(), String> {
    use notify_debouncer_mini::new_debouncer;

    let label = window.label().to_string();
    let emit_label = label.clone();
    let file_path = PathBuf::from(&path);

    let mut debouncer = new_debouncer(Duration::from_millis(200), move |result| {
        if let Ok(_events) = result {
            let _ = window.emit_to(&emit_label, "file-changed", ());
        }
    })
    .map_err(|e| format!("Failed to create file watcher: {}", e))?;

    debouncer
        .watcher()
        .watch(file_path.as_path(), notify::RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch file: {}", e))?;

    state.0.lock().unwrap().insert(label, debouncer);
    Ok(())
}

/// Stop watching a file for the calling window.
#[tauri::command]
fn unwatch_file(window: tauri::WebviewWindow, state: tauri::State<'_, FileWatchers>) {
    state.0.lock().unwrap().remove(window.label());
}

/// Export the current webview content as a PDF file.
#[cfg(target_os = "macos")]
#[tauri::command]
async fn export_pdf(window: tauri::WebviewWindow, output_path: String) -> Result<(), String> {
    pdf::export_pdf(window, output_path).await
}

#[cfg(target_os = "windows")]
#[tauri::command]
async fn export_pdf(window: tauri::WebviewWindow, output_path: String) -> Result<(), String> {
    pdf_windows::export_pdf(window, output_path).await
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[tauri::command]
async fn export_pdf() -> Result<(), String> {
    Err("PDF export is only supported on macOS and Windows".into())
}

#[tauri::command]
fn install_cli() -> Result<String, String> {
    cli_path::install_cli()
}

#[tauri::command]
fn get_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

/// Set emdee as the default handler for markdown file extensions on macOS.
#[cfg(target_os = "macos")]
#[tauri::command]
fn set_default_md_handler() -> Result<(), String> {
    use core_foundation::base::TCFType;
    use core_foundation::string::CFString;

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn UTTypeCreatePreferredIdentifierForTag(
            tag_class: *const std::ffi::c_void,
            tag: *const std::ffi::c_void,
            conforming_to: *const std::ffi::c_void,
        ) -> *mut std::ffi::c_void;

        fn LSSetDefaultRoleHandlerForContentType(
            content_type: *const std::ffi::c_void,
            role: u32,
            handler_bundle_id: *const std::ffi::c_void,
        ) -> i32;
    }

    const LS_ROLES_ALL: u32 = 0xFFFF_FFFF;
    let tag_class = CFString::new("public.filename-extension");
    let bundle_id = CFString::new("com.emdee.app");

    for ext in &["md", "markdown", "mdown", "mkd", "mdx"] {
        let ext_cf = CFString::new(ext);
        unsafe {
            let uti = UTTypeCreatePreferredIdentifierForTag(
                tag_class.as_concrete_TypeRef() as *const _,
                ext_cf.as_concrete_TypeRef() as *const _,
                std::ptr::null(),
            );
            if uti.is_null() {
                continue;
            }
            let result = LSSetDefaultRoleHandlerForContentType(
                uti,
                LS_ROLES_ALL,
                bundle_id.as_concrete_TypeRef() as *const _,
            );
            core_foundation::base::CFRelease(uti as *const _);
            if result != 0 {
                return Err(format!("Failed to set handler for .{}: error {}", ext, result));
            }
        }
    }
    Ok(())
}

/// Set emdee as the default handler for markdown file extensions on Windows.
/// Registers a ProgID and associates each extension under HKCU, then notifies the shell.
#[cfg(target_os = "windows")]
#[tauri::command]
fn set_default_md_handler() -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?;
    let exe_str = exe.to_string_lossy().to_string();
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    let classes = hkcu
        .open_subkey_with_flags("Software\\Classes", KEY_WRITE | KEY_READ)
        .map_err(|e| format!("Failed to open registry: {}", e))?;

    // Create ProgID: emdee.Markdown
    let (prog_key, _) = classes
        .create_subkey("emdee.Markdown")
        .map_err(|e| format!("Failed to create ProgID: {}", e))?;
    prog_key
        .set_value("", &"Markdown File")
        .map_err(|e| format!("Failed to set ProgID value: {}", e))?;

    let (cmd_key, _) = prog_key
        .create_subkey("shell\\open\\command")
        .map_err(|e| format!("Failed to create command key: {}", e))?;
    cmd_key
        .set_value("", &format!("\"{}\" \"%1\"", exe_str))
        .map_err(|e| format!("Failed to set command: {}", e))?;

    // Associate each extension with the ProgID
    for ext in &["md", "markdown", "mdown", "mkd", "mdx"] {
        let ext_key_name = format!(".{}", ext);
        let (ext_key, _) = classes
            .create_subkey(&ext_key_name)
            .map_err(|e| format!("Failed to create .{} key: {}", ext, e))?;
        ext_key
            .set_value("", &"emdee.Markdown")
            .map_err(|e| format!("Failed to set .{} association: {}", ext, e))?;
    }

    // Notify the shell that file associations have changed
    unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::SendMessageTimeoutW(
            windows_sys::Win32::UI::WindowsAndMessaging::HWND_BROADCAST,
            windows_sys::Win32::UI::WindowsAndMessaging::WM_SETTINGCHANGE,
            0,
            0,
            windows_sys::Win32::UI::WindowsAndMessaging::SMTO_ABORTIFHUNG,
            5000,
            std::ptr::null_mut(),
        );
    }

    Ok(())
}

/// Set emdee as the default handler for markdown file extensions on Linux
/// via `xdg-mime default`.
#[cfg(target_os = "linux")]
#[tauri::command]
fn set_default_md_handler() -> Result<(), String> {
    // Determine the .desktop file name — Tauri uses the identifier from tauri.conf.json
    let desktop_entry = "com.emdee.app.desktop";

    let status = std::process::Command::new("xdg-mime")
        .args(["default", desktop_entry, "text/markdown"])
        .status()
        .map_err(|e| format!("Failed to run xdg-mime: {}", e))?;

    if !status.success() {
        return Err("xdg-mime failed to set default handler".into());
    }

    Ok(())
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
        .manage(FileWatchers(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![read_file, resolve_path, get_initial_file, watch_file, unwatch_file, export_pdf, install_cli, set_default_md_handler, get_platform])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<FileWatchers>() {
                    state.0.lock().unwrap().remove(window.label());
                }
            }
        })
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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
