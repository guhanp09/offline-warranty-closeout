export function microphone(onRecording, onProcessing, transcribe, onResult, onError) {
  let recorder;
  let timeout;
  let starting = false;
  return async () => {
    if (starting) return;
    if (recorder?.state === 'recording') {
      recorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      onError('This browser cannot record from the microphone. Type your note instead.');
      return;
    }
    starting = true;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      const parts = [];
      recorder.ondataavailable = (event) => parts.push(event.data);
      recorder.onstop = async () => {
        clearTimeout(timeout);
        stream.getTracks().forEach((track) => track.stop());
        onRecording(false);
        onProcessing(true);
        try {
          onResult(await transcribe(new Blob(parts, { type: recorder.mimeType })));
        } catch (error) {
          onError(error.message);
        } finally {
          recorder = null;
          onProcessing(false);
        }
      };
      recorder.start();
      onRecording(true);
      timeout = setTimeout(() => {
        if (recorder?.state === 'recording') recorder.stop();
      }, 18_000);
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      onError('Allow microphone access in your browser, or type the service note.');
    } finally {
      starting = false;
    }
  };
}
