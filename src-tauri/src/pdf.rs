use std::sync::mpsc;
use tauri::WebviewWindow;

pub async fn export_pdf(window: WebviewWindow, output_path: String) -> Result<(), String> {
    let (tx, rx) = mpsc::channel::<Result<(), String>>();

    window
        .with_webview(move |webview| {
            use block2::RcBlock;
            use objc2::MainThreadMarker;
            use objc2_foundation::{NSData, NSError};
            use objc2_web_kit::{WKPDFConfiguration, WKWebView};

            unsafe {
                let wkwebview: &WKWebView = &*(webview.inner() as *const WKWebView);

                // with_webview runs on the main thread
                let mtm = MainThreadMarker::new().expect("must be on main thread");
                let config = WKPDFConfiguration::new(mtm);

                let block = RcBlock::new(move |data: *mut NSData, error: *mut NSError| {
                    if !error.is_null() {
                        let err: &NSError = &*error;
                        let desc = err.localizedDescription().to_string();
                        let _ = tx.send(Err(desc));
                        return;
                    }

                    if data.is_null() {
                        let _ = tx.send(Err("No PDF data returned".into()));
                        return;
                    }

                    let data: &NSData = &*data;
                    let length: usize = objc2::msg_send![data, length];
                    let ptr: *const u8 = objc2::msg_send![data, bytes];
                    let bytes = std::slice::from_raw_parts(ptr, length);

                    match std::fs::write(&output_path, bytes) {
                        Ok(()) => {
                            let _ = tx.send(Ok(()));
                        }
                        Err(e) => {
                            let _ = tx.send(Err(format!("Failed to write PDF: {}", e)));
                        }
                    }
                });

                wkwebview.createPDFWithConfiguration_completionHandler(Some(&config), &block);
            }
        })
        .map_err(|e| format!("Failed to access webview: {}", e))?;

    rx.recv()
        .map_err(|_| "PDF export channel closed unexpectedly".to_string())?
}
