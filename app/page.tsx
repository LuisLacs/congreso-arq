'use client'; 

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Loader2, Image as ImageIcon, X, Wand2, Download, Trash2, ShieldAlert, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase'; 
import { User } from '@supabase/supabase-js';
import { Toaster, toast } from 'sonner';
import { toJpeg } from 'html-to-image';

interface Photo {
  id: string;
  user_id: string;
  image_url: string;
  status: string;
  category?: string;
  created_at: string;
  user_metadata?: Record<string, unknown>; 
}

// ==========================================
// CONFIGURACIÓN DEL CONGRESO
// ==========================================
const ADMIN_EMAIL = "tu_correo@gmail.com"; 

// Agregamos la fecha exacta de desbloqueo (Hora Sinaloa UTC-7)
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
  const collageRef = useRef<HTMLDivElement>(null); 

  // Función para saber si el día ya se desbloqueó
  const isCategoryUnlocked = (dateString: string) => {
    if (isAdminView) return true; // El admin no tiene restricciones
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
      
      // 2. Llamamos a las fotos DENTRO de la función asíncrona para evitar el error de ESLint
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
    if (availablePhotos.length < 4) return toast.error('Se necesitan al menos 4 fotos en esta categoría.');
    setCollagePhotos([...availablePhotos].sort(() => 0.5 - Math.random()).slice(0, 4));
    setCollageStyleType(Math.floor(Math.random() * 3) + 1);
    setIsCollageOpen(true);
  };

  const downloadCollage = async () => {
    if (!collageRef.current) return;
    setIsDownloading(true);
    try {
      const dataUrl = await toJpeg(collageRef.current, { quality: 0.95 });
      const link = document.createElement('a');
      link.download = `congreso-arq-${Date.now()}.jpeg`;
      link.href = dataUrl;
      link.click();
      toast.success('¡Guardado! Listo para tus Stories 📸');
    } finally { setIsDownloading(false); }
  };

  const displayedPhotos = activeCategory === 'todos' ? photos : photos.filter(p => p.category === activeCategory);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 pb-40 font-sans flex flex-col">
      <Toaster theme="light" position="top-center" />

      {/* CABECERA CON LOGOS OFICIALES */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-gray-200 shadow-sm">
        <div className="p-4 flex justify-between items-center max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
               {/* eslint-disable-next-line @next/next/no-img-element */}
               <img src="/logo-arq.png" alt="ARQ" className="h-10 md:h-12 object-contain" />
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

        {/* NAVEGACIÓN DE DÍAS CON CANDADOS */}
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

      {/* FOOTER CON LOGOS INSTITUCIONALES */}
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

      {/* ZONA INFERIOR DE SUBIDA (Solo muestra días desbloqueados) */}
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

      {/* MODAL COLLAGE (CON LOGOS INTEGADOS) */}
      {isCollageOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/95">
            <div className="flex justify-end p-4">
                <button onClick={() => setIsCollageOpen(false)} className="p-2 bg-white/10 text-white rounded-full"><X size={20} /></button>
            </div>
            <div className="flex-1 flex items-center justify-center p-4">
               <div ref={collageRef} className="relative w-full max-w-sm aspect-[9/16] bg-white overflow-hidden">
                  
                  {collageStyleType === 1 && (
                    <div className="absolute inset-0 bg-[#f4f4f4] p-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/logo-dia.png" alt="Logo" className="w-3/4 mx-auto mb-4 object-contain opacity-90" />
                      <div className="grid grid-cols-2 gap-2">
                        {collagePhotos.slice(0,4).map((p) => (
                           // eslint-disable-next-line @next/next/no-img-element
                          <img key={p.id} src={p.image_url} crossOrigin="anonymous" className="w-full aspect-square object-cover rounded-md shadow-sm" alt="img" />
                        ))}
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/logo-arq.png" alt="Logo" className="w-24 absolute bottom-6 right-6 opacity-80" />
                    </div>
                  )}

                  {/* Los otros 2 estilos se mantienen con el diseño de arquitectura pero adaptados al tamaño */}
                  {collageStyleType !== 1 && (
                    <div className="absolute inset-0 bg-gray-900 flex flex-col p-4 justify-between">
                      <div className="flex-1 flex flex-col gap-2 justify-center">
                        {collagePhotos.slice(0,3).map((p) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={p.id} src={p.image_url} crossOrigin="anonymous" className="w-full h-1/3 object-cover sepia-[.20] rounded-sm" alt="img" />
                        ))}
                      </div>
                      <div className="pt-4 flex justify-center bg-gray-900">
                         {/* eslint-disable-next-line @next/next/no-img-element */}
                         <img src="/logo-arq.png" alt="Logo" className="h-10 object-contain invert" />
                      </div>
                    </div>
                  )}
               </div>
            </div>
            <div className="p-6 flex justify-center">
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