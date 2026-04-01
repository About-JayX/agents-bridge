use tokio::{
    io,
    process::{ChildStderr, ChildStdout},
};

/// Drain Claude stdio so long-running sessions do not block on full pipe buffers.
pub fn spawn_stdio_drainers(stdout: Option<ChildStdout>, stderr: Option<ChildStderr>) {
    if let Some(stdout) = stdout {
        tokio::spawn(async move {
            let mut stdout = stdout;
            let mut sink = io::sink();
            let _ = io::copy(&mut stdout, &mut sink).await;
        });
    }
    if let Some(stderr) = stderr {
        tokio::spawn(async move {
            let mut stderr = stderr;
            let mut sink = io::sink();
            let _ = io::copy(&mut stderr, &mut sink).await;
        });
    }
}
