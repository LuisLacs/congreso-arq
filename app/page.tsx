'use client'; 

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Loader2, X, Wand2, Download, ShieldAlert, Lock, Info } from 'lucide-react';
import { supabase } from '../lib/supabase'; 
import { User } from '@supabase/supabase-js';
import { Toaster, toast } from 'sonner';
import { toJpeg } from 'html-to-image';
import { saveAs } from 'file-saver'; // NUEVO: Importación para descargas móviles

interface Photo {
  id: string;
  user_id: string;
  image_url: string;
  status: string;
  category?: string;
  created_at: string;
  user_metadata?: Record<string, unknown>; 
}

const ADMIN_EMAIL = "tu_correo@gmail.com"; 

const CATEGORIES = [
  { id: 'todos', label: 'Todas las fotos', unlockDate: '2026-10-05T00:00:00-07:00' },
  { id: 'lunes', label: 'Lunes 05 - Rally', unlockDate: '2026-10-05T00:00:00-07:00' },
  { id: 'martes', label: 'Martes 06 - Talleres', unlockDate: '2026-10-06T00:00:00-07:00' },
  { id: 'miercoles', label: 'Miércoles 07 - Talleres', unlockDate: '2026-10-07T00:00:00-07:00' },
  { id: 'jueves', label: 'Jueves 08 - Congreso Día 1', unlockDate: '2026-10-08T00:00:00-07:00' },
  { id: 'viernes', label: 'Viernes 09 - Fiesta', unlockDate: '2026-10-09T00:00:00-07:00' },
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activeCategory, setActiveCategory] = useState('todos');
  const [uploadCategory, setUploadCategory] = useState('lunes'); 
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userPhotos, setUserPhotos] = useState<Photo[]>([]);
  const [selectedUserMeta, setSelectedUserMeta] = useState<Record<string, unknown> | null>(null);
  const [isCollageOpen, setIsCollageOpen] = useState(false);
  const [collagePhotos, setCollagePhotos] = useState<Photo[]>([]);
  const [collageStyleType, setCollageStyleType] = useState<number>(1);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);
  const [isMobileBrowser, setIsMobileBrowser] = useState(false); // NUEVO: Detector de navegador
  const collageRef = useRef<HTMLDivElement>(null); 

  const isCategoryUnlocked = (dateString: string) => {
    if (isAdminView) return true; 
    const today = new Date();
    const unlockDate = new Date(dateString);
    return today >= unlockDate;
  };

  const fetchPhotos = useCallback(async () => {
    const { data } = await supabase.from('photos').select('*').order('created_at', { ascending: false }); 
    if (data) setPhotos(data as Photo[]);
  }, []);

  useEffect(() => {
    if (selectedUserId || isCollageOpen || isAdminView) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = 'auto'; };
  }, [selectedUserId, isCollageOpen, isAdminView]);

  useEffect(() => {
    const initApp = async () => {
      // 1. Verificamos el usuario
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if(session?.user?.email === ADMIN_EMAIL) setIsAdminView(true);
      
      // 2. Cargamos las fotos
      await fetchPhotos();

      // 3. Detección de navegador móvil (Corregido para TypeScript y ESLint)
      const ua = navigator.userAgent || navigator.vendor || (window as Window & { opera?: string }).opera || '';
      if (ua.indexOf("FBAN") > -1 || ua.indexOf("FBAV") > -1 || ua.indexOf("Instagram") > -1) {
          setIsMobileBrowser(true);
      }
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
    if (!files || files.length === 0 || !user) return; 

    setIsUploading(true);
    const toastId = toast.loading(`Subiendo ${files.length} fotos a ${uploadCategory}...`);
    const uploadUrl = `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`;

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
        const res = await fetch(uploadUrl, { method: 'POST', body: formData });
        const data = await res.json();
        return data.secure_url; 
      });

      const uploadedUrls = await Promise.all(uploadPromises);
      const photosToInsert = uploadedUrls.map(url => ({ user_id: user.id, image_url: url, status: 'aprobado', category: uploadCategory }));

      await supabase.from('photos').insert(photosToInsert);
      toast.success('¡Fotos subidas con éxito!', { id: toastId });
      fetchPhotos();
      setActiveCategory(uploadCategory);
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
    if (!error) setPhotos(photos.filter(p => p.id !== id));
  };

  const openUserGallery = (userId: string) => {
    if(isAdminView) return; 
    setSelectedUserId(userId);
    setUserPhotos(photos.filter(p => p.user_id === userId));
    setSelectedUserMeta(user?.id === userId ? user.user_metadata : { full_name: "Asistente del Congreso" });
  };

  const openCollageGenerator = () => {
    const availablePhotos = activeCategory === 'todos' ? photos : photos.filter(p => p.category === activeCategory);
    if (availablePhotos.length < 3) return toast.error('Se necesitan al menos 3 fotos en esta categoría.'); // Reducido a 3
    setCollagePhotos([...availablePhotos].sort(() => 0.5 - Math.random()).slice(0, 3)); // Usaremos 3 fotos para mejor diseño
    setCollageStyleType(Math.floor(Math.random() * 2) + 1); // Solo 2 estilos (Blanco y Negro)
    setIsCollageOpen(true);
  };

  const downloadCollage = async () => {
    if (!collageRef.current) return;
    setIsDownloading(true);
    try {
      const dataUrl = await toJpeg(collageRef.current, { quality: 1.0, pixelRatio: 2 }); // Mejor calidad
      
      if (isMobileBrowser) {
          // Si está en IG/FB, muestra la imagen en pantalla completa para que mantenga presionado y guarde
          const newWindow = window.open();
          if(newWindow) {
              newWindow.document.write(`<img src="${dataUrl}" style="width:100%; height:auto;" /> <br/> <p style="text-align:center; font-family:sans-serif; margin-top:20px;">Mantén presionada la imagen para guardarla.</p>`);
          } else {
              toast.error("Por favor, abre la página en Chrome o Safari para descargar.");
          }
      } else {
          // Descarga normal forzada con file-saver
          saveAs(dataUrl, `congreso-arq-${Date.now()}.jpg`);
          toast.success('¡Guardado! Listo para tus Stories 📸');
      }
    } catch (err) {
      toast.error('Error al procesar la imagen.');
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
              {user?.email === ADMIN_EMAIL && (
                  <button onClick={() => setIsAdminView(!isAdminView)} className={`${isAdminView ? 'bg-gray-800' : 'bg-red-500'} text-white p-2 rounded-full font-bold shadow-md`}>
                      <ShieldAlert size={18} />
                  </button>
              )}
              {!isAdminView && (
                  <button onClick={openCollageGenerator} className="bg-[#bda15f] text-white p-2 sm:px-4 sm:py-2 rounded-full font-bold shadow-md hover:bg-[#a68c4e]">
                      <Wand2 size={18} /> <span className="hidden sm:inline text-sm ml-1">Collage</span>
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
            <div key={photo.id} onClick={() => openUserGallery(photo.user_id)} className={`relative break-inside-avoid w-full rounded-2xl overflow-hidden bg-gray-200 group cursor-pointer ${index % 3 === 0 ? 'h-80' : 'h-64'}`}>
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
      {user && !isAdminView && (
        <div className="fixed bottom-6 left-0 right-0 flex flex-col items-center z-30 pointer-events-none gap-3">
          <div className="pointer-events-auto bg-white/95 shadow-lg rounded-full px-4 py-2 flex items-center gap-2 text-sm border border-gray-200">
             <span className="font-bold text-gray-500 text-xs">Día:</span>
             <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} className="bg-transparent font-bold outline-none text-gray-900 text-xs cursor-pointer">
               {CATEGORIES.filter(c => c.id !== 'todos' && isCategoryUnlocked(c.unlockDate)).map(c => (
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

      {/* MODAL COLLAGE REDISEÑADO */}
      {isCollageOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/95">
            <div className="flex justify-end p-4">
                <button onClick={() => setIsCollageOpen(false)} className="p-2 bg-white/10 text-white rounded-full"><X size={20} /></button>
            </div>
            
            <div className="flex-1 flex items-center justify-center p-4">
               {/* Contenedor principal 9:16 */}
               <div ref={collageRef} className="relative w-full max-w-[360px] aspect-[9/16] overflow-hidden shadow-2xl rounded-sm bg-white">
                  
                  {/* ESTILO 1: POLAROID BLANCO (ESTÉTICO) */}
                  {collageStyleType === 1 && (
                    <div className="absolute inset-0 bg-[#FAFAFA] flex flex-col p-5">
                      {/* Logo Superior */}
                      <div className="h-[12%] flex items-center justify-center mb-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo-dia.png" alt="Logo" className="h-full object-contain opacity-90" />
                      </div>
                      
                      {/* Área de fotos (3 fotos estilo polaroid) */}
                      <div className="flex-1 flex flex-col gap-3">
                        {/* Foto principal grande */}
                        <div className="flex-1 w-full bg-gray-200 rounded-md overflow-hidden shadow-sm">
                           {/* eslint-disable-next-line @next/next/no-img-element */}
                           <img src={collagePhotos[0]?.image_url} crossOrigin="anonymous" className="w-full h-full object-cover" alt="img1" />
                        </div>
                        {/* Dos fotos inferiores */}
                        <div className="h-[35%] w-full flex gap-3">
                           <div className="flex-1 bg-gray-200 rounded-md overflow-hidden shadow-sm">
                             {/* eslint-disable-next-line @next/next/no-img-element */}
                             <img src={collagePhotos[1]?.image_url} crossOrigin="anonymous" className="w-full h-full object-cover" alt="img2" />
                           </div>
                           <div className="flex-1 bg-gray-200 rounded-md overflow-hidden shadow-sm">
                             {/* eslint-disable-next-line @next/next/no-img-element */}
                             <img src={collagePhotos[2]?.image_url} crossOrigin="anonymous" className="w-full h-full object-cover" alt="img3" />
                           </div>
                        </div>
                      </div>

                      {/* Logo Inferior */}
                      <div className="h-[10%] mt-4 flex items-end justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo-arq.png" alt="Logo" className="h-4/5 object-contain opacity-80" />
                      </div>
                    </div>
                  )}

                  {/* ESTILO 2: CINE OSCURO (ESTÉTICO) */}
                  {collageStyleType === 2 && (
                    <div className="absolute inset-0 bg-[#0a0a0a] flex flex-col p-3 border-4 border-[#0a0a0a]">
                      <div className="flex-1 flex flex-col gap-2">
                        {collagePhotos.slice(0,3).map((p, i) => (
                          <div key={p.id} className="flex-1 relative overflow-hidden rounded-sm group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.image_url} crossOrigin="anonymous" className="absolute inset-0 w-full h-full object-cover sepia-[.15]" alt={`img${i}`} />
                          </div>
                        ))}
                      </div>
                      {/* Bandeja inferior con logos centrados */}
                      <div className="h-[12%] mt-2 flex items-center justify-center gap-4 bg-[#111] rounded-sm px-4">
                         {/* eslint-disable-next-line @next/next/no-img-element */}
                         <img src="/logo-dia.png" alt="Logo" className="h-2/5 object-contain invert opacity-80" />
                         <div className="w-[1px] h-1/2 bg-gray-700"></div>
                         {/* eslint-disable-next-line @next/next/no-img-element */}
                         <img src="/logo-arq.png" alt="Logo" className="h-2/5 object-contain invert opacity-80" />
                      </div>
                    </div>
                  )}
               </div>
            </div>

            {/* AVISO MÓVIL SI APLICA */}
            {isMobileBrowser && (
               <div className="px-6 pb-2 text-center text-gray-400 text-xs flex items-center justify-center gap-1">
                 <Info size={12}/> Si usas navegador de app, se abrirá en pestaña nueva para guardar.
               </div>
            )}

            <div className="p-6 flex justify-center pb-10">
                <button onClick={downloadCollage} disabled={isDownloading} className="bg-[#bda15f] text-white px-8 py-4 rounded-full font-bold shadow-xl w-full max-w-xs flex justify-center items-center gap-2">
                   {isDownloading ? <Loader2 size={24} className="animate-spin" /> : <Download size={24} />} 
                   DESCARGAR
                </button>
            </div>
        </div>
      )}
    </main>
  );
}