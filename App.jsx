```react
import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  Sparkles, 
  Upload, 
  Image as ImageIcon, 
  Video, 
  Copy, 
  Check, 
  RefreshCw, 
  Sliders, 
  FileText,
  Trash2,
  HelpCircle,
  Clock,
  Eye,
  Key
} from 'lucide-react';

// Inisialisasi Firebase secara aman jika konfigurasi eksternal disediakan
let auth = null;
let appId = 'promptify-media-ai';

if (typeof __firebase_config !== 'undefined' && __firebase_config) {
  try {
    const firebaseConfig = JSON.parse(__firebase_config);
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    appId = typeof __app_id !== 'undefined' ? __app_id : 'promptify-media-ai';
  } catch (e) {
    console.error("Firebase initialization failed:", e);
  }
}

export default function App() {
  const [user, setUser] = useState(null);
  const [mediaType, setMediaType] = useState('image'); // 'image' | 'video'
  const [mediaPreview, setMediaPreview] = useState(null);
  const [base64Media, setBase64Media] = useState(null);
  const [mimeType, setMimeType] = useState('');
  const [fileName, setFileName] = useState('');
  
  // Opsi Kustomisasi Prompt
  const [promptStyle, setPromptStyle] = useState('detailed'); // 'detailed', 'artistic', 'cinematic', 'minimalist'
  const [targetPlatform, setTargetPlatform] = useState('midjourney'); // 'midjourney', 'stable-diffusion', 'dall-e', 'general'
  const [customInstructions, setCustomInstructions] = useState('');
  
  // Kunci API (Bisa dimasukkan manual oleh pengguna jika dideploy mandiri)
  const [userApiKey, setUserApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);

  // Status Proses
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  
  // Riwayat Prompt Lokal
  const [history, setHistory] = useState([]);
  
  const fileInputRef = useRef(null);

  // Efek untuk autentikasi anonim Firebase jika diaktifkan
  useEffect(() => {
    if (auth) {
      const initAuth = async () => {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.error("Auth sign in failed:", e);
        }
      };
      initAuth();
      const unsubscribe = onAuthStateChanged(auth, setUser);
      return () => unsubscribe();
    }
  }, []);

  // Muat riwayat dan API Key dari localStorage saat pertama kali dijalankan
  useEffect(() => {
    const savedHistory = localStorage.getItem('promptify_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
    
    const savedKey = localStorage.getItem('promptify_api_key');
    if (savedKey) {
      setUserApiKey(savedKey);
    } else {
      setShowKeyInput(true); // Tampilkan input kunci jika belum ada
    }
  }, []);

  const handleSaveKey = (key) => {
    setUserApiKey(key);
    localStorage.setItem('promptify_api_key', key);
    setShowKeyInput(false);
  };

  // Fungsi untuk menyimpan riwayat
  const saveToHistory = (newPrompt, mediaName, type, preview) => {
    const historyItem = {
      id: Date.now(),
      prompt: newPrompt,
      mediaName: mediaName || 'Media Tanpa Nama',
      type: type,
      preview: type === 'image' ? preview : null,
      timestamp: new Date().toLocaleString('id-ID')
    };
    
    if (historyItem.preview && historyItem.preview.length > 500000) {
      historyItem.preview = null; 
    }

    const updatedHistory = [historyItem, ...history.slice(0, 19)];
    setHistory(updatedHistory);
    localStorage.setItem('promptify_history', JSON.stringify(updatedHistory));
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('promptify_history');
  };

  // Handler Unggah File
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setMimeType(file.type);
    setError(null);
    setGeneratedPrompt('');

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (mediaType === 'image' && !isImage) {
      setError('Harap masukkan file gambar yang valid (PNG, JPG, WEBP, dll).');
      return;
    }
    if (mediaType === 'video' && !isVideo) {
      setError('Harap masukkan file video yang valid (MP4, WEBM, dll).');
      return;
    }

    if (file.size > 15 * 1024 * 1024) { 
      setError('Ukuran file terlalu besar. Harap unggah file di bawah 15MB.');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setMediaPreview(objectUrl);

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result.split(',')[1];
      setBase64Media(base64Data);
    };
    reader.onerror = () => {
      setError('Gagal membaca file media.');
    };
    reader.readAsDataURL(file);
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleReset = () => {
    setMediaPreview(null);
    setBase64Media(null);
    setFileName('');
    setMimeType('');
    setGeneratedPrompt('');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Fungsi Pemanggilan API Gemini dengan Skema Retry & Exponential Backoff
  const generatePromptFromMedia = async () => {
    // Tentukan kunci mana yang akan digunakan
    const activeApiKey = userApiKey || "";
    
    if (!activeApiKey) {
      setError('Masukkan Kunci API Gemini Anda di bagian atas aplikasi terlebih dahulu agar sistem dapat bekerja.');
      setShowKeyInput(true);
      return;
    }

    if (!base64Media) {
      setError('Harap unggah gambar atau video terlebih dahulu.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedPrompt('');

    const systemPrompt = `Anda adalah ahli rekayasa prompt (Prompt Engineer) profesional untuk AI generator gambar/video seperti Midjourney, Stable Diffusion, DALL-E 3, dan Sora.
Tugas utama Anda adalah menganalisis media (gambar atau video) yang diunggah pengguna dan secara otomatis merumuskan deskripsi prompt yang SANGAT DETAIL, ARTIStik, dan terstruktur dengan indah.

Instruksi format output berdasarkan parameter pilihan pengguna:
- Gaya: ${promptStyle} (detailed = deskriptif mendalam, artistic = estetika seni digital/lukisan, cinematic = drama sinematik pencahayaan film, minimalist = bersih dan sederhana).
- Platform Target: ${targetPlatform} (Midjourney = sertakan parameter seperti --ar, --v, --stylize jika relevan; Stable Diffusion = detail spesifik tag kualitas, pencahayaan, detail kamera; DALL-E 3 = deskripsi naratif padat; general = deskripsi universal serbaguna).

Formatkan output Anda menjadi 3 bagian utama yang mudah dibaca:
1. **PROMPT UTAMA (Gunakan Bahasa Inggris untuk kompatibilitas AI generator terbaik)**: Tulis dalam satu blok teks tebal/kutipan agar mudah disalin.
2. **KATA KUNCI & PARAMETER PENDUKUNG**: Daftar tag gaya, pencahayaan, warna, kamera, atau aspek rasio pengkondisian yang disarankan.
3. **ANALISIS VISUAL ELEMEN**: Penjelasan singkat mengapa elemen-elemen tersebut dipilih berdasarkan gambar asli yang diunggah dalam Bahasa Indonesia.`;

    const userQuery = `Buatkan saya prompt terbaik untuk platform ${targetPlatform} dengan gaya '${promptStyle}'. ${customInstructions ? `Instruksi tambahan khusus dari pengguna: ${customInstructions}` : ""}`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: userQuery },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Media
              }
            }
          ]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${activeApiKey}`;

    const fetchWithRetry = async (retries = 5, delay = 1000) => {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
        }

        return await response.json();
      } catch (err) {
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchWithRetry(retries - 1, delay * 2);
        } else {
          throw err;
        }
      }
    };

    try {
      const data = await fetchWithRetry();
      const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (textResult) {
        setGeneratedPrompt(textResult);
        saveToHistory(textResult, fileName, mediaType, mediaPreview);
      } else {
        throw new Error("Respons API kosong atau tidak sesuai format.");
      }
    } catch (err) {
      console.error(err);
      setError(`Gagal membuat prompt: ${err.message || 'Koneksi bermasalah atau format file tidak didukung.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (textToCopy) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        throw new Error("Gagal menyalin teks.");
      }
    } catch (err) {
      console.error("Gagal menyalin:", err);
    }
  };

  const extractMainPrompt = (fullText) => {
    const match = fullText.match(/\*\*PROMPT UTAMA.*?\*\*:\s*([\s\S]*?)(?=\n\n\*\*|\n\*\*|$)/i) || 
                  fullText.match(/```[\s\S]*?```/) || 
                  [null, fullText];
    return match[1] ? match[1].replace(/`+/g, '').trim() : fullText;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50 px-4 py-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-purple-600 to-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-500/20">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-100 to-indigo-400 bg-clip-text text-transparent">
                Promptify Media AI
              </h1>
              <p className="text-xs text-slate-400">
                Ubah gambar & video Anda menjadi prompt AI yang detail dan bernilai seni tinggi
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowKeyInput(!showKeyInput)}
              className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-750 border border-slate-700 py-1.5 px-3 rounded-xl text-slate-300 transition-all"
            >
              <Key className="h-3.5 w-3.5 text-indigo-400" />
              {userApiKey ? "Ganti API Key" : "Atur API Key"}
            </button>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Model: Gemini 2.5 Flash
            </span>
          </div>
        </div>
      </header>

      {/* Bagian Input API Key */}
      {showKeyInput && (
        <div className="bg-indigo-950/40 border-b border-indigo-900/40 p-4">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center gap-4">
            <div className="text-left flex-grow">
              <h3 className="text-sm font-semibold text-indigo-300 flex items-center gap-2">
                <Key className="h-4 w-4" /> Masukkan Gemini API Key Anda
              </h3>
              <p className="text-xs text-indigo-400/80">
                Aplikasi ini membutuhkan kunci API Gemini agar dapat melakukan pemrosesan visual. Kunci disimpan dengan aman di browser lokal Anda.
              </p>
            </div>
            <div className="flex w-full sm:w-auto gap-2">
              <input 
                type="password" 
                placeholder="AIzaSy..." 
                defaultValue={userApiKey}
                id="apiKeyInput"
                className="bg-slate-950 border border-indigo-900/60 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 flex-grow sm:w-64"
              />
              <button 
                onClick={() => {
                  const val = document.getElementById('apiKeyInput').value;
                  handleSaveKey(val);
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Kolom Kiri */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Box 1: Unggah Media */}
          <div className="bg-slate-850 border border-slate-800 rounded-2xl p-5 shadow-xl bg-slate-800/40 backdrop-blur-sm">
            <h2 className="text-md font-semibold mb-4 flex items-center gap-2 text-indigo-400">
              <Sliders className="h-4 w-4" /> 1. Pilih Tipe & Unggah Media
            </h2>
            
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 rounded-xl mb-4">
              <button
                type="button"
                onClick={() => { setMediaType('image'); handleReset(); }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  mediaType === 'image' 
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <ImageIcon className="h-4 w-4" />
                Gambar / Foto
              </button>
              <button
                type="button"
                onClick={() => { setMediaType('video'); handleReset(); }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  mediaType === 'video' 
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Video className="h-4 w-4" />
                Video Pendek
              </button>
            </div>

            {!mediaPreview ? (
              <div 
                onClick={triggerFileInput}
                className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all bg-slate-900/30 hover:bg-slate-900/50 group"
              >
                <div className="bg-slate-800 p-4 rounded-full group-hover:bg-indigo-600/10 group-hover:text-indigo-400 transition-all text-slate-400">
                  {mediaType === 'image' ? <ImageIcon className="h-8 w-8" /> : <Video className="h-8 w-8" />}
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-200">
                    Klik untuk memilih atau seret file ke sini
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {mediaType === 'image' ? 'PNG, JPG, JPEG, WEBP (Maks. 15MB)' : 'MP4, WEBM, MOV (Maks. 15MB)'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative border border-slate-700 rounded-xl overflow-hidden bg-slate-900 flex flex-col items-center justify-center min-h-[220px]">
                {mediaType === 'image' ? (
                  <img src={mediaPreview} alt="Pratinjau Unggahan" className="max-h-[300px] w-full object-contain" />
                ) : (
                  <video src={mediaPreview} controls className="max-h-[300px] w-full object-contain" />
                )}
                
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    onClick={handleReset}
                    className="bg-slate-900/90 text-rose-400 hover:bg-rose-600 hover:text-white p-2 rounded-lg transition-all shadow-md"
                    title="Hapus media"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                
                <div className="w-full bg-slate-950 px-4 py-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span className="truncate max-w-[200px]" title={fileName}>
                    {fileName}
                  </span>
                  <span>
                    {mediaType === 'image' ? 'Foto' : 'Video'}
                  </span>
                </div>
              </div>
            )}

            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              accept={mediaType === 'image' ? 'image/*' : 'video/*'}
              className="hidden"
            />
          </div>

          {/* Box 2: Pengaturan Kustomisasi */}
          <div className="bg-slate-850 border border-slate-800 rounded-2xl p-5 shadow-xl bg-slate-800/40 backdrop-blur-sm">
            <h2 className="text-md font-semibold mb-4 flex items-center gap-2 text-indigo-400">
              <Sliders className="h-4 w-4" /> 2. Kustomisasi Prompt AI
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Gaya Estetika Prompt
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'detailed', label: 'Deskriptif Detil' },
                    { id: 'artistic', label: 'Seni Digital' },
                    { id: 'cinematic', label: 'Sinematik Drama' },
                    { id: 'minimalist', label: 'Minimalis Bersih' }
                  ].map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setPromptStyle(style.id)}
                      className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition-all text-center ${
                        promptStyle === style.id
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                          : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Target AI Generator
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'midjourney', label: 'Midjourney' },
                    { id: 'stable-diffusion', label: 'Stable Diffusion' },
                    { id: 'dall-e', label: 'DALL-E 3' },
                    { id: 'general', label: 'Umum / Semua AI' }
                  ].map((platform) => (
                    <button
                      key={platform.id}
                      type="button"
                      onClick={() => setTargetPlatform(platform.id)}
                      className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition-all text-center ${
                        targetPlatform === platform.id
                          ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                          : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {platform.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Instruksi Tambahan (Opsional)
                </label>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Contoh: Tambahkan neon futuristik, ubah siang menjadi malam..."
                  className="w-full bg-slate-900/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 h-20 resize-none transition-all"
                />
              </div>

              <button
                type="button"
                disabled={isLoading || !base64Media}
                onClick={generatePromptFromMedia}
                className={`w-full py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${
                  isLoading || !base64Media
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-750'
                    : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 text-white hover:opacity-95 shadow-indigo-500/10 active:scale-[0.98]'
                }`}
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-white" />
                    Menganalisis & Membuat Prompt...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-amber-300 fill-amber-300" />
                    Buat Prompt AI Sekarang
                  </>
                )}
              </button>

              {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl text-xs flex gap-2 items-start">
                  <span className="font-bold">Error:</span>
                  <p>{error}</p>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Kolom Kanan */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          <div className="bg-slate-850 border border-slate-800 rounded-2xl p-6 shadow-xl bg-slate-800/40 backdrop-blur-sm flex flex-col min-h-[450px]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h2 className="text-md font-semibold flex items-center gap-2 text-indigo-400">
                <FileText className="h-4 w-4" /> Hasil Strukturisasi Prompt
              </h2>
              {generatedPrompt && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopy(extractMainPrompt(generatedPrompt))}
                    className="flex items-center gap-1.5 text-xs font-semibold bg-slate-850 hover:bg-slate-750 border border-slate-700 py-1.5 px-3 rounded-lg text-slate-300 transition-all"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    Salin Prompt Utama
                  </button>
                  <button
                    onClick={() => handleCopy(generatedPrompt)}
                    className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 py-1.5 px-3 rounded-lg text-indigo-300 transition-all"
                  >
                    Salin Semua
                  </button>
                </div>
              )}
            </div>

            <div className="flex-grow flex flex-col justify-center">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="relative flex items-center justify-center mb-4">
                    <div className="absolute animate-ping h-8 w-8 rounded-full bg-indigo-500 opacity-20"></div>
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-t-indigo-500 border-slate-750"></div>
                  </div>
                  <h3 className="text-sm font-medium text-slate-200">Kecerdasan Buatan sedang berpikir...</h3>
                  <p className="text-xs text-slate-500 max-w-xs mt-1">
                    Kami sedang mengurai elemen visual dan menyusun skema prompt terbaik.
                  </p>
                </div>
              ) : generatedPrompt ? (
                <div className="text-sm text-slate-300 leading-relaxed space-y-4 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
                  {generatedPrompt.split('\n\n').map((paragraph, index) => {
                    if (paragraph.startsWith('1.') || paragraph.includes('PROMPT UTAMA')) {
                      return (
                        <div key={index} className="bg-indigo-950/40 border border-indigo-500/20 rounded-xl p-4 my-2">
                          <p className="font-semibold text-indigo-400 mb-1.5 text-xs uppercase tracking-wider flex items-center gap-1">
                            <Sparkles className="h-3 w-3" /> Prompt Utama (Siap Salin)
                          </p>
                          <p className="text-slate-100 font-mono select-all bg-slate-950/60 p-3 rounded-lg text-xs leading-relaxed border border-indigo-500/10">
                            {paragraph.replace(/1\.\s+\*\*PROMPT UTAMA.*?\*\*:\s*/i, '').replace(/\*\*/g, '')}
                          </p>
                        </div>
                      );
                    }
                    if (paragraph.startsWith('2.') || paragraph.includes('KATA KUNCI')) {
                      return (
                        <div key={index} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                          <p className="font-semibold text-purple-400 mb-2 text-xs uppercase tracking-wider">
                            Kata Kunci & Parameter Pendukung
                          </p>
                          <div className="text-slate-300 text-xs">
                            {paragraph.replace(/2\.\s+\*\*KATA KUNCI.*?\*\*:\s*/i, '').split('\n').map((line, i) => (
                              <p key={i} className="mb-1">{line}</p>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    if (paragraph.startsWith('3.') || paragraph.includes('ANALISIS VISUAL')) {
                      return (
                        <div key={index} className="bg-slate-900/30 border border-slate-800/60 rounded-xl p-4">
                          <p className="font-semibold text-teal-400 mb-2 text-xs uppercase tracking-wider">
                            Analisis Visual Elemen
                          </p>
                          <div className="text-slate-400 text-xs leading-relaxed">
                            {paragraph.replace(/3\.\s+\*\*ANALISIS VISUAL.*?\*\*:\s*/i, '').split('\n').map((line, i) => (
                              <p key={i} className="mb-1">{line}</p>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                      <p key={index} className="whitespace-pre-line text-xs md:text-sm">
                        {paragraph}
                      </p>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
                  <div className="bg-slate-900 p-4 rounded-full border border-slate-800 mb-3 text-slate-600">
                    <Sparkles className="h-8 w-8" />
                  </div>
                  <h3 className="text-sm font-medium text-slate-400">Belum ada Prompt yang dibuat</h3>
                  <p className="text-xs max-w-sm mt-1 px-4">
                    Masukkan foto atau video di panel kiri, tentukan kustomisasi gaya Anda, lalu tekan tombol "Buat Prompt AI Sekarang" untuk memproses.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-slate-800 pt-4 flex gap-3 items-start text-xs text-slate-500 bg-slate-900/10 p-3 rounded-lg">
              <HelpCircle className="h-4 w-4 text-indigo-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-400">Tips:</span> Gunakan platform target <strong>Midjourney</strong> untuk rincian fotorealistis murni, atau <strong>DALL-E 3</strong> jika Anda ingin deskripsi yang lebih bercerita.
              </div>
            </div>
          </div>

          {/* Riwayat Pembuatan Prompt */}
          <div className="bg-slate-850 border border-slate-800 rounded-2xl p-5 shadow-xl bg-slate-800/40 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-300">
                <Clock className="h-4 w-4 text-slate-400" /> Riwayat Sesi (Lokal)
              </h2>
              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-xs text-rose-400 hover:text-rose-300 font-medium transition-all"
                >
                  Bersihkan Riwayat
                </button>
              )}
            </div>

            {history.length > 0 ? (
              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                {history.map((item) => (
                  <div key={item.id} className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 flex items-start gap-3 hover:border-slate-700 transition-all">
                    {item.preview ? (
                      <img src={item.preview} alt="Mini" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-slate-700" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 text-slate-400">
                        {item.type === 'image' ? <ImageIcon className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                      </div>
                    )}
                    
                    <div className="flex-grow min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-semibold text-slate-400 truncate max-w-[150px]">
                          {item.mediaName}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {item.timestamp}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-2 pr-4 italic">
                        "{extractMainPrompt(item.prompt)}"
                      </p>
                      <button
                        onClick={() => {
                          setGeneratedPrompt(item.prompt);
                          if (item.preview) {
                            setMediaPreview(item.preview);
                            setMediaType(item.type);
                          }
                        }}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold mt-1.5 flex items-center gap-1"
                      >
                        <Eye className="h-3 w-3" /> Muat Ulang Hasil Analisis
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-6">
                Belum ada riwayat pembuatan prompt pada sesi ini.
              </p>
            )}
          </div>

        </div>

      </main>

      <footer className="mt-12 border-t border-slate-800 py-6 px-4 bg-slate-950/60 text-center text-xs text-slate-500">
        <p>© 2026 Promptify Media AI. Semua proses analitis didukung oleh model multi-modal Gemini 2.5 Flash.</p>
      </footer>
    </div>
  );
}

```
