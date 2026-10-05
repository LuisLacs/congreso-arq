'use client'; 

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Loader2, Image as ImageIcon, X, Wand2, Download, Trash2, ShieldAlert, Lock, Info } from 'lucide-react';
import { supabase } from '../lib/supabase'; 
import { User } from '@supabase/supabase-js';
import { Toaster, toast } from 'sonner';
import { toJpeg } from 'html-to-image';
import { saveAs } from 'file-saver';

interface Photo {
  id: string;
  user_id: string;
  image_url: string;
  status: string;
  category?: string;
  created_at: string;
  user_metadata?: Record<string, unknown>; 
}

// AGREGA AQUÍ LOS CORREOS DE TODOS LOS ADMINISTRADORES
const ADMIN_EMAILS = [
  "luislacsgamer@gmail.com",
  "jazmincs.castro@gmail.com",
  "jartperezgarcia@gmail.com"
]; 

// 1. FORMATO DE TEXTO EXACTO (YYYY-MM-DD)
const CATEGORIES = [
  { id: 'todos', label: 'Todas las fotos', unlockDate: '2026-10-05' },
  { id: 'lunes', label: 'Lunes 05 - Rally', unlockDate: '2026-10-05' },
  { id: 'martes', label: 'Martes 06 - Talleres', unlockDate: '2026-10-06' },
  { id: 'miercoles', label: 'Miércoles 07 - Talleres', unlockDate: '2026-10-07' },
  { id: 'jueves', label: 'Jueves 08 - Congreso Día 1', unlockDate: '2026-10-08' },
  { id: 'viernes', label: 'Viernes 09 - Fiesta', unlockDate: '2026-10-09' },
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activeCategory, setActiveCategory] = useState('todos');
  const [uploadCategory, setUploadCategory] = useState(''); 
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userPhotos, setUserPhotos] = useState<Photo[]>([]);
  const [selectedUserMeta, setSelectedUserMeta] = useState<Record<string, unknown> | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null); 
  const [isCollageOpen, setIsCollageOpen] = useState(false);
  const [collagePhotos, setCollagePhotos] = useState<Photo[]>([]);
  const [collageStyleType, setCollageStyleType] = useState<number>(1);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);
  const collageRef = useRef<HTMLDivElement>(null); 

 // 3. FUNCIÓN DE CANDADO A PRUEBA DE ZONAS HORARIAS
  const isCategoryUnlocked = (dateString: string) => {
    if (isAdminView) return true; 
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    // Compara "2026-10-05" >= "2026-10-05" (Siempre funcionará)
    const todayStr = `${year}-${month}-${day}`; 
    return todayStr >= dateString;
  };
  const categoriesForUpload = isAdminView 
    ? CATEGORIES.filter(c => c.id !== 'todos') 
    : CATEGORIES.filter(c => c.id !== 'todos' && isCategoryUnlocked(c.unlockDate)); 

  const currentUploadCategory = categoriesForUpload.find(c => c.id === uploadCategory) 
    ? uploadCategory 
    : (categoriesForUpload[0]?.id || '');

  const fetchPhotos = useCallback(async () => {
    const { data } = await supabase.from('photos').select('*').order('created_at', { ascending: false }); 
    if (data) setPhotos(data as Photo[]);
  }, []);

  useEffect(() => {
    if (selectedUserId || isCollageOpen || isAdminView || selectedPhoto) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = 'auto'; };
  }, [selectedUserId, isCollageOpen, isAdminView, selectedPhoto]);

  useEffect(() => {
    const initApp = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if(session?.user?.email && ADMIN_EMAILS.includes(session.user.email)) setIsAdminView(true);
      await fetchPhotos();
    };
    initApp();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [fetchPhotos]);

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !user || !currentUploadCategory) return; 

    setIsUploading(true);
    const toastId = toast.loading(`Subiendo ${files.length} foto(s)...`);
    const uploadUrl = `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`;

    try {
      // NUEVO: Definimos el perfil que se guardará con la foto
      let uploaderMeta = {
        full_name: user.user_metadata?.full_name || "Asistente del Congreso",
        avatar_url: user.user_metadata?.avatar_url || "/logo-arq.png"
      };

      // Si quien sube es administrador, usamos un nombre oficial anónimo
      if (user.email && ADMIN_EMAILS.includes(user.email)) {
        uploaderMeta = {
          full_name: "Comité Organizador ARQ",
          avatar_url: "/logo-arq.png" // Opcional: Puedes cambiar esto por el link directo al logo dorado si prefieres
        };
      }

      const uploadPromises = Array.from(files).map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
        const res = await fetch(uploadUrl, { method: 'POST', body: formData });
        const data = await res.json();
        return data.secure_url; 
      });

      const uploadedUrls = await Promise.all(uploadPromises);
      const photosToInsert = uploadedUrls.map(url => ({ 
        user_id: user.id, 
        image_url: url, 
        status: 'aprobado', 
        category: currentUploadCategory,
        user_metadata: uploaderMeta // <-- Guardamos la identidad aquí
      }));

      await supabase.from('photos').insert(photosToInsert);
      toast.success('¡Fotos subidas con éxito!', { id: toastId });
      fetchPhotos();
      setActiveCategory(currentUploadCategory);
    } catch (error) {
      toast.error('Error al subir fotos.', { id: toastId });
    } finally {
      setIsUploading(false);
      event.target.value = ''; 
    }
  };

  const handleDeletePhoto = async (id: string) => {
    if(!confirm('¿Borrar esta foto de la galería pública?')) return;
    const { error } = await supabase.from('photos').delete().eq('id', id);
    if (!error) {
       setPhotos(photos.filter(p => p.id !== id));
       setUserPhotos(userPhotos.filter(p => p.id !== id)); 
    }
  };

  const openUserGallery = (userId: string) => {
    if(isAdminView) return; 
    setSelectedUserId(userId);
    const filteredPhotos = photos.filter(p => p.user_id === userId);
    setUserPhotos(filteredPhotos);

    // NUEVO: Extraemos el nombre real guardado en la foto
    if (filteredPhotos.length > 0 && filteredPhotos[0].user_metadata) {
       setSelectedUserMeta(filteredPhotos[0].user_metadata);
    } else if (user?.id === userId) {
       // Respaldo por si es una foto subida antes de esta actualización
       setSelectedUserMeta(user.user_metadata);
    } else {
       setSelectedUserMeta({ full_name: "Asistente del Congreso", avatar_url: "/logo-arq.png" });
    }
  };

  const openCollageGenerator = () => {
    const targetPhotos = selectedUserId 
      ? userPhotos 
      : photos.filter(p => p.user_id === user?.id);

    if (targetPhotos.length < 4) return toast.error('Sube al menos 4 fotos tuyas para generar tu collage.'); 
    
    setCollagePhotos([...targetPhotos].sort(() => 0.5 - Math.random()).slice(0, 4)); 
    setCollageStyleType(Math.floor(Math.random() * 2) + 1); 
    setIsCollageOpen(true);
  };

  const downloadIndividualPhoto = async (url: string) => {
    const toastId = toast.loading('Preparando descarga...');
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], `congreso-foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Foto Congreso ARQ' });
        toast.success('¡Listo!', { id: toastId });
      } else {
        saveAs(blob, `congreso-foto-${Date.now()}.jpg`);
        toast.success('¡Descargada!', { id: toastId });
      }
    } catch (e) {
      saveAs(url, `congreso-foto-${Date.now()}.jpg`);
      toast.success('¡Descargada!', { id: toastId });
    }
  };

  const downloadCollage = async () => {
    if (!collageRef.current) return;
    setIsDownloading(true);
    try {
      const dataUrl = await toJpeg(collageRef.current, { quality: 1.0, pixelRatio: 3 }); 
      try {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const file = new File([blob], `congreso-arq-collage-${Date.now()}.jpg`, { type: 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Congreso ARQ 2026' });
          toast.success('¡Acción completada!');
        } else {
          saveAs(dataUrl, `congreso-arq-${Date.now()}.jpg`);
          toast.success('¡Guardado en tu dispositivo!');
        }
      } catch (shareError) {
        saveAs(dataUrl, `congreso-arq-${Date.now()}.jpg`);
        toast.success('¡Guardado en tu dispositivo!');
      }
    } catch (err) {
      toast.error('Error al generar la imagen.');
    } finally { 
      setIsDownloading(false); 
    }
  };

  const displayedPhotos = activeCategory === 'todos' ? photos : photos.filter(p => p.category === activeCategory);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 pb-40 font-sans flex flex-col">
      <Toaster theme="light" position="top-center" />

      {/* CABECERA */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-gray-200 shadow-sm">
        <div className="p-4 flex justify-between items-center max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
               {/* eslint-disable-next-line @next/next/no-img-element */}
               <img src="/logo-arq.png" alt="ARQ" className="h-10 md:h-12 object-contain" />
               <div className="hidden sm:flex items-center gap-2 bg-red-50 text-red-600 px-3 py-1 rounded-full border border-red-100">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                  <span className="text-[10px] font-black tracking-widest uppercase">En Vivo</span>
               </div>
               <div className="hidden sm:block border-l-2 border-gray-300 pl-3">
                 {/* eslint-disable-next-line @next/next/no-img-element */}
                 <img src="/logo-dia.png" alt="Día del Arquitecto" className="h-8 object-contain" />
               </div>
            </div>
            
            <div className="flex items-center gap-2">
              {user?.email && ADMIN_EMAILS.includes(user.email) && (
                  <button onClick={() => setIsAdminView(!isAdminView)} className={`${isAdminView ? 'bg-gray-800' : 'bg-red-500'} text-white p-2 rounded-full font-bold shadow-md`}>
                      <ShieldAlert size={18} />
                  </button>
              )}
              {user && !isAdminView && (
                  <button onClick={openCollageGenerator} className="bg-[#bda15f] text-white p-2 sm:px-4 sm:py-2 rounded-full font-bold shadow-md hover:bg-[#a68c4e]">
                      <Wand2 size={18} /> <span className="hidden sm:inline text-sm ml-1">Mi Collage</span>
                  </button>
              )}
              {user ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.user_metadata.avatar_url} onClick={() => !isAdminView && openUserGallery(user.id)} alt="Avatar" className="w-9 h-9 rounded-full border-2 border-[#bda15f] cursor-pointer" />
              ) : (
                  <button onClick={handleLogin} className="bg-gray-900 text-white px-5 py-2 rounded-full text-sm font-bold">Entrar</button>
              )}
            </div>
        </div>

        {!isAdminView && (
            <div className="flex overflow-x-auto gap-2 px-4 py-3 bg-gray-50 border-t border-gray-100 scrollbar-hide max-w-7xl mx-auto">
                {CATEGORIES.map(c => {
                    const unlocked = isCategoryUnlocked(c.unlockDate);
                    return (
                        <button
                            key={c.id}
                            onClick={() => unlocked && setActiveCategory(c.id)}
                            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1
                            ${activeCategory === c.id ? 'bg-gray-900 text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600'}
                            ${!unlocked ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'hover:bg-gray-200'}`}
                        >
                            {c.label} {!unlocked && <Lock size={12} />}
                        </button>
                    )
                })}
            </div>
        )}
      </header>

      {/* MURO PRINCIPAL */}
      <section className="p-4 max-w-7xl mx-auto flex-1 w-full">
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          {displayedPhotos.map((photo, index) => (
            <div key={photo.id} onClick={() => setSelectedPhoto(photo)} className={`relative break-inside-avoid w-full rounded-2xl overflow-hidden bg-gray-200 group cursor-pointer ${index % 3 === 0 ? 'h-80' : 'h-64'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.image_url} alt="Evento" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white border-t border-gray-200 py-6 mt-10">
         <div className="max-w-4xl mx-auto px-4 flex flex-wrap justify-center items-center gap-6 md:gap-12 opacity-70 grayscale hover:grayscale-0 transition-all duration-300">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-uadeo.png" alt="UAdeO" className="h-12 object-contain" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-fcarm.png" alt="FCARM" className="h-14 object-contain" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-regionv.png" alt="Región V" className="h-12 object-contain" />
         </div>
      </footer>

      {/* ZONA SUBIDA */}
      {user && categoriesForUpload.length > 0 && (
        <div className="fixed bottom-6 left-0 right-0 flex flex-col items-center z-30 pointer-events-none gap-3">
          <div className="pointer-events-auto bg-white/95 shadow-lg rounded-full px-4 py-2 flex items-center gap-2 text-sm border border-gray-200">
             <span className="font-bold text-gray-500 text-xs">Día:</span>
             <select value={currentUploadCategory} onChange={(e) => setUploadCategory(e.target.value)} className="bg-transparent font-bold outline-none text-gray-900 text-xs cursor-pointer">
               {categoriesForUpload.map(c => (
                 <option key={c.id} value={c.id}>{c.label}</option>
               ))}
             </select>
          </div>
          <label className="pointer-events-auto bg-gray-900 text-white flex items-center gap-2 px-8 py-4 rounded-full font-extrabold shadow-2xl cursor-pointer hover:-translate-y-1 transition-transform">
            {isUploading ? <Loader2 size={24} className="animate-spin" /> : <Plus size={24} />}
            <span>SUBIR FOTOS</span>
            <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} disabled={isUploading}/>
          </label>
        </div>
      )}

      {/* ================= MODALES ================= */}

      {/* 1. MODAL FOTO EN PANTALLA COMPLETA */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black/95 backdrop-blur-sm">
           <div className="flex justify-between items-center p-4">
              {!isAdminView ? (
                 <div 
                    className="flex items-center gap-2 cursor-pointer bg-white/10 hover:bg-white/20 px-3 py-2 rounded-full transition-colors"
                    onClick={() => { openUserGallery(selectedPhoto.user_id); setSelectedPhoto(null); }}
                 >
                    <ImageIcon size={16} className="text-white" />
                    <span className="text-white text-xs font-bold tracking-wide">Galería del autor</span>
                 </div>
              ) : (<div></div>)}
              
              <div className="flex items-center gap-3">
                 <button onClick={() => downloadIndividualPhoto(selectedPhoto.image_url)} className="p-2 bg-white/10 text-white hover:bg-white/20 rounded-full transition-colors">
                    <Download size={20} />
                 </button>
                 {isAdminView && (
                    <button onClick={() => { handleDeletePhoto(selectedPhoto.id); setSelectedPhoto(null); }} className="p-2 bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-full transition-colors">
                       <Trash2 size={20} />
                    </button>
                 )}
                 <button onClick={() => setSelectedPhoto(null)} className="p-2 bg-white/10 text-white hover:bg-white/20 rounded-full transition-colors">
                    <X size={20} />
                 </button>
              </div>
           </div>
           <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
               {/* eslint-disable-next-line @next/next/no-img-element */}
               <img src={selectedPhoto.image_url} alt="Foto grande" className="max-w-full max-h-full object-contain rounded-md shadow-2xl" />
           </div>
        </div>
      )}

      {/* 2. MODAL GALERÍA DE USUARIO */}
      {selectedUserId && (
        <div className="fixed inset-0 z-[65] flex flex-col bg-gray-50">
          <header className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-gray-200 p-4 flex justify-between items-center z-10 shadow-sm">
            <div className="flex items-center gap-3">
               {/* eslint-disable-next-line @next/next/no-img-element */}
               <img src={(selectedUserMeta?.avatar_url as string) || '/logo-arq.png'} alt="Avatar" className="w-10 h-10 rounded-full border border-gray-200 object-contain" />
               <div>
                  <h2 className="font-bold text-gray-900 leading-tight">{(selectedUserMeta?.full_name as string) || 'Asistente'}</h2>
                  <p className="text-xs text-gray-500">{userPhotos.length} fotos compartidas</p>
               </div>
            </div>
            <div className="flex items-center gap-2">
               <button onClick={openCollageGenerator} className="bg-[#bda15f] text-white p-2 rounded-full font-bold shadow-md hover:bg-[#a68c4e]">
                  <Wand2 size={16} />
               </button>
               <button onClick={() => setSelectedUserId(null)} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-full transition-colors">
                  <X size={20} />
               </button>
            </div>
          </header>
          
          <div className="p-4 flex-1 overflow-y-auto">
             <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4 max-w-7xl mx-auto">
                {userPhotos.map((photo, index) => (
                  <div key={photo.id} onClick={() => setSelectedPhoto(photo)} className={`relative break-inside-avoid w-full rounded-xl overflow-hidden bg-gray-200 cursor-pointer group ${index % 2 === 0 ? 'h-64' : 'h-48'}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.image_url} alt="Evento" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                ))}
             </div>
          </div>
        </div>
      )}

      {/* 3. MODAL COLLAGE */}
      {isCollageOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 overflow-y-auto">
            <div className="flex justify-end p-4 shrink-0">
                <button onClick={() => setIsCollageOpen(false)} className="p-2 bg-white/10 text-white rounded-full"><X size={20} /></button>
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center p-4 shrink-0">
               <div ref={collageRef} className="relative w-full max-w-[360px] aspect-[9/16] shrink-0 overflow-hidden shadow-2xl bg-white">
                  
                  {/* ESTILO 1: BLANCO (CUADRÍCULA 2x2) */}
                  {collageStyleType === 1 && (
                    <div className="absolute inset-0 bg-[#f4f4f4] flex flex-col items-center justify-center px-6 py-10">
                      <div className="w-full flex justify-center mb-8 h-[15%]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo-dia.png" alt="Logo" className="h-full object-contain" />
                      </div>
                      
                      <div className="w-full grid grid-cols-2 gap-3">
                        {collagePhotos.slice(0,4).map((p, i) => (
                           <div key={i} className="aspect-square relative rounded-2xl overflow-hidden shadow-sm bg-gray-200">
                             {/* eslint-disable-next-line @next/next/no-img-element */}
                             <img src={p.image_url} crossOrigin="anonymous" className="absolute inset-0 w-full h-full object-cover" alt={`img${i}`} />
                           </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ESTILO 2: NEGRO (3 Fotos Apiladas dinámicas) */}
                  {collageStyleType === 2 && (
                    <div className="absolute inset-0 bg-[#0a0a0a] flex flex-col p-4">
                      <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                        {collagePhotos.slice(0,3).map((p, i) => (
                           <div key={i} className="flex-1 relative rounded-xl overflow-hidden bg-gray-900 border border-[#222]">
                             {/* eslint-disable-next-line @next/next/no-img-element */}
                             <img src={p.image_url} crossOrigin="anonymous" className="absolute inset-0 w-full h-full object-cover sepia-[.15]" alt={`img${i}`} />
                           </div>
                        ))}
                      </div>
                      
                      <div className="h-14 mt-4 flex items-center justify-center gap-6 shrink-0">
                         {/* eslint-disable-next-line @next/next/no-img-element */}
                         <img src="/logo-dia.png" alt="Logo" className="h-full object-contain invert opacity-80" />
                         <div className="w-[1px] h-3/4 bg-gray-700"></div>
                         {/* eslint-disable-next-line @next/next/no-img-element */}
                         <img src="/logo-arq.png" alt="Logo" className="h-2/3 object-contain invert opacity-80" />
                      </div>
                    </div>
                  )}
               </div>
            </div>

            <div className="p-6 shrink-0 flex justify-center pb-10 flex-col items-center gap-3">
                <button onClick={downloadCollage} disabled={isDownloading} className="bg-[#bda15f] text-white px-8 py-4 rounded-full font-bold shadow-xl w-full max-w-xs flex justify-center items-center gap-2">
                   {isDownloading ? <Loader2 size={24} className="animate-spin" /> : <Download size={24} />} 
                   GUARDAR O COMPARTIR
                </button>
                <span className="text-[10px] text-gray-400 font-medium tracking-wide">
                   Se abrirá el menú de tu teléfono
                </span>
            </div>
        </div>
      )}
    </main>
  );
}