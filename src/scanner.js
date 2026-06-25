// Scanner codici a barre: fotocamera posteriore + ZXing, con decodifica del frame in
// DUE orientamenti (0 e 90 gradi), cosi' i codici a barre 1D (EAN/UPC) si leggono sia
// col telefono in verticale sia in orizzontale.
//
// ZXing viene caricato on-demand via <script> nella build UMD: niente import ES "bare"
// (che Safari non risolve come pagina statica) e niente dipendenze da bundler.

const ZXING_UMD = "https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js";

let zxingPromise = null;
let ZXlib = null;
let scanReader = null;
let scanHints = null;
let scanStream = null;
let scanTimer = null;
let scanning = false;
let currentVideo = null;

// Canvas riusati: uno per il frame catturato, uno per la versione ruotata 90 gradi.
const grabCanvas = document.createElement("canvas");
const grabCtx = grabCanvas.getContext("2d", { willReadFrequently: true });
const rotCanvas = document.createElement("canvas");
const rotCtx = rotCanvas.getContext("2d", { willReadFrequently: true });

function loadZXing() {
  if (window.ZXing) {
    return Promise.resolve(window.ZXing);
  }
  if (zxingPromise) {
    return zxingPromise;
  }
  zxingPromise = new Promise(function (resolve, reject) {
    const s = document.createElement("script");
    s.src = ZXING_UMD;
    s.onload = function () {
      if (window.ZXing) {
        resolve(window.ZXing);
      } else {
        reject(new Error("Libreria di scansione caricata ma 'ZXing' non disponibile."));
      }
    };
    s.onerror = function () {
      reject(new Error("Impossibile caricare la libreria di scansione (controlla la rete)."));
    };
    document.head.appendChild(s);
  });
  return zxingPromise;
}

// Messa a fuoco continua sul track video, dove il dispositivo la espone (best-effort).
function applyContinuousFocus(video) {
  try {
    const stream = video && video.srcObject;
    const track = stream && stream.getVideoTracks && stream.getVideoTracks()[0];
    if (!track || !track.getCapabilities) {
      return;
    }
    const caps = track.getCapabilities();
    if (caps.focusMode && caps.focusMode.indexOf("continuous") >= 0) {
      track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(function () {});
    }
  } catch (e) { /* ottimizzazione best-effort: ignora */ }
}

// Decodifica un singolo canvas; ritorna il testo del codice o null.
function decodeCanvas(canvas) {
  try {
    const source = new ZXlib.HTMLCanvasElementLuminanceSource(canvas);
    const bitmap = new ZXlib.BinaryBitmap(new ZXlib.HybridBinarizer(source));
    const result = scanReader.decode(bitmap, scanHints);
    return result ? result.getText() : null;
  } catch (e) {
    return null; // NotFound/Format/Checksum: nessun codice valido in questo frame
  }
}

export function isScanning() {
  return scanning;
}

// Avvia lo scanner. opts = { video, onResult(code), onError(err) }.
export async function startScanner(opts) {
  const video = opts.video;
  currentVideo = video;

  function loop() {
    if (!scanning) {
      return;
    }
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw && vh) {
      // ridimensiona il lato lungo a ~800px: piu' veloce, sufficiente per gli EAN
      const scale = Math.min(1, 800 / Math.max(vw, vh));
      const w = Math.max(1, Math.round(vw * scale));
      const h = Math.max(1, Math.round(vh * scale));
      grabCanvas.width = w;
      grabCanvas.height = h;
      grabCtx.drawImage(video, 0, 0, w, h);

      let code = decodeCanvas(grabCanvas); // orientamento naturale
      if (!code) {
        rotCanvas.width = h; // stessa immagine ruotata di 90 gradi
        rotCanvas.height = w;
        rotCtx.save();
        rotCtx.translate(h / 2, w / 2);
        rotCtx.rotate(Math.PI / 2);
        rotCtx.drawImage(grabCanvas, -w / 2, -h / 2);
        rotCtx.restore();
        code = decodeCanvas(rotCanvas);
      }
      if (code) {
        stopScanner();
        if (opts.onResult) {
          opts.onResult(code);
        }
        return;
      }
    }
    scanTimer = setTimeout(loop, 100);
  }

  try {
    ZXlib = await loadZXing();

    // Reader 1D limitato ai formati dei prodotti + TRY_HARDER (decodifica piu' rapida).
    if (!scanReader) {
      scanHints = new Map();
      scanHints.set(ZXlib.DecodeHintType.POSSIBLE_FORMATS, [
        ZXlib.BarcodeFormat.EAN_13, ZXlib.BarcodeFormat.EAN_8,
        ZXlib.BarcodeFormat.UPC_A, ZXlib.BarcodeFormat.UPC_E,
        ZXlib.BarcodeFormat.CODE_128, ZXlib.BarcodeFormat.CODE_39
      ]);
      scanHints.set(ZXlib.DecodeHintType.TRY_HARDER, true);
      scanReader = new ZXlib.MultiFormatReader();
      scanReader.setHints(scanHints);
    }

    // Camera posteriore ad alta risoluzione: piu' pixel sul codice = lettura possibile
    // anche quando il fuoco non e' perfetto.
    scanStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });

    video.srcObject = scanStream;
    video.setAttribute("playsinline", "true");
    video.muted = true;
    video.style.display = "block";
    scanning = true;
    await video.play().catch(function () {});
    applyContinuousFocus(video);
    loop();
  } catch (e) {
    stopScanner();
    if (opts.onError) {
      opts.onError(e);
    }
  }
}

export function stopScanner() {
  scanning = false;
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }
  if (scanStream) {
    scanStream.getTracks().forEach(function (t) { t.stop(); });
    scanStream = null;
  }
  if (currentVideo) {
    currentVideo.srcObject = null;
    currentVideo.style.display = "none";
  }
}
