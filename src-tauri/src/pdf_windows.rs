use std::sync::mpsc;
use tauri::WebviewWindow;

pub async fn export_pdf(window: WebviewWindow, output_path: String) -> Result<(), String> {
    let (tx, rx) = mpsc::channel::<Result<(), String>>();

    window
        .with_webview(move |webview| {
            use webview2_com::Microsoft::Web::WebView2::Win32::*;
            use webview2_com::PrintToPdfCompletedHandler;
            use windows::core::{Interface, HSTRING, PCWSTR};

            unsafe {
                let controller = webview.controller();
                let core_webview = match controller.CoreWebView2() {
                    Ok(wv) => wv,
                    Err(e) => {
                        let _ = tx.send(Err(format!("Failed to get webview: {}", e)));
                        return;
                    }
                };

                let webview_7: ICoreWebView2_7 = match core_webview.cast() {
                    Ok(wv) => wv,
                    Err(e) => {
                        let _ = tx.send(Err(format!(
                            "PDF export requires a newer WebView2 runtime: {}",
                            e
                        )));
                        return;
                    }
                };

                let path = HSTRING::from(&output_path);

                let handler = PrintToPdfCompletedHandler::create(Box::new(
                    move |errorcode, is_successful| {
                        if errorcode.is_ok() && is_successful {
                            let _ = tx.send(Ok(()));
                        } else {
                            let _ = tx.send(Err(format!(
                                "PDF export failed (error: {:?})",
                                errorcode
                            )));
                        }
                        Ok(())
                    },
                ));

                if let Err(e) =
                    webview_7.PrintToPdf(PCWSTR::from_raw(path.as_ptr()), None, &handler)
                {
                    // Handler won't fire — but tx was moved into it and will drop,
                    // causing rx.recv() to return Err. Log for diagnostics.
                    log::error!("PrintToPdf call failed: {}", e);
                }
            }
        })
        .map_err(|e| format!("Failed to access webview: {}", e))?;

    rx.recv()
        .map_err(|_| "PDF export channel closed unexpectedly".to_string())?
}
