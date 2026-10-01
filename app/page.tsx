'use client'; 

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Loader2, Image as ImageIcon, X, Wand2, Download, Trash2, ShieldAlert } from 'lucide-react';
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
// 1. Correo del administrador (para borrar fotos)
const ADMIN_EMAIL = "luislacsgamer@gmail.com"; 

// 2. Cronograma Oficial
const CATEGORIES = [
  { id: 'todos', label: 'Todas las fotos' },
  { id: 'lunes', label: 'Lunes 05 - Rally y Piscinada' },
  { id: 'martes', label: 'Martes 06 - Talleres' },
  { id: 'miercoles', label: 'Miércoles 07 - Talleres' },
  { id: 'jueves', label: 'Jueves 08 - Congreso Día 1' },
  { id: 'viernes', label: 'Viernes 09 - Congreso y Fiesta' },
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  
  // Estados de Categorías (Filtros)
  const [activeCategory, setActiveCategory] = useState('todos');
  const [uploadCategory, setUploadCategory] = useState('lunes'); // Por defecto al subir

  // Estados del Perfil
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userPhotos, setUserPhotos] = useState<Photo[]>([]);
  const [selectedUserMeta, setSelectedUserMeta] = useState<Record<string, unknown> | null>(null);

  // Estados del Collage
  const [isCollageOpen, setIsCollageOpen] = useState(false);
  const [collagePhotos, setCollagePhotos] = useState<Photo[]>([]);
  const [collageStyleType, setCollageStyleType] = useState<number>(1);
  const [isDownloading, setIsDownloading] = useState(false);
  const collageRef = useRef<HTMLDivElement>(null); 

  // Estado de Moderación
  const [isAdminView, setIsAdminView] = useState(false);

  const fetchPhotos = useCallback(async () => {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .order('created_at', { ascending: false }); 
    if (data) setPhotos(data as Photo[]);
  }, []);

  useEffect(() => {
    if (selectedUserId || isCollageOpen || isAdminView) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; };
  }, [selectedUserId, isCollageOpen, isAdminView]);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };
    checkUser();
    // eslint-disable-next-line
    fetchPhotos().catch(console.error);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [fetchPhotos]);

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? `${window.location.origin}` : '' }
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !user) return; 

    setIsUploading(true);
    const toastId = toast.loading(`Subiendo ${files.length} fotos a ${uploadCategory}...`);
    const uploadUrl = `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`;
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', uploadPreset);
        const response = await fetch(uploadUrl, { method: 'POST', body: formData });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.secure_url; 
      });

      const uploadedUrls = await Promise.all(uploadPromises);
      const photosToInsert = uploadedUrls.map(url => ({
        user_id: user.id, image_url: url, status: 'aprobado', category: uploadCategory
      }));

      const { error } = await supabase.from('photos').insert(photosToInsert);
      if (error) throw error;
      
      toast.success('¡Fotos subidas con éxito!', { id: toastId });
      fetchPhotos();
      
      // Si el usuario subió fotos, cambiamos la vista a esa categoría para que las vea
      setActiveCategory(uploadCategory);

    } catch (error) {
      toast.error('Error al subir fotos. Revisa tu conexión.', { id: toastId });
    } finally {
      setIsUploading(false);
      event.target.value = ''; 
    }
  };

  const handleDeletePhoto = async (id: string) => {
    if(!confirm('¿Seguro que quieres borrar esta foto de la galería pública?')) return;
    const toastId = toast.loading('Borrando foto...');
    const { error } = await supabase.from('photos').delete().eq('id', id);
    if (error) {
        toast.error('Error al borrar la foto', { id: toastId });
    } else {
        toast.success('Foto eliminada', { id: toastId });
        setPhotos(photos.filter(p => p.id !== id));
    }
  };

  const openUserGallery = (userId: string) => {
    if(isAdminView) return; 
    setSelectedUserId(userId);
    setUserPhotos(photos.filter(p => p.user_id === userId));
    if (user && user.id === userId) setSelectedUserMeta(user.user_metadata);
    else setSelectedUserMeta({ full_name: "Asistente del Congreso" });
  };

  const openCollageGenerator = () => {
    // Filtramos las fotos por la categoría actual, o todas si está en "todos"
    const availablePhotos = activeCategory === 'todos' ? photos : photos.filter(p => p.category === activeCategory);
    
    if (availablePhotos.length < 4) {
        toast.error('Se necesitan al menos 4 fotos en esta categoría para el collage.');
        return;
    }

    const shuffled = [...availablePhotos].sort(() => 0.5 - Math.random());
    setCollagePhotos(shuffled.slice(0, 4));
    setCollageStyleType(Math.floor(Math.random() * 3) + 1);
    setIsCollageOpen(true);
  };

  const downloadCollage = async () => {
    if (!collageRef.current) return;
    setIsDownloading(true);
    try {
      const dataUrl = await toJpeg(collageRef.current, { quality: 0.95 });
      const link = document.createElement('a');
      link.download = `congreso-arq-collage-${Date.now()}.jpeg`;
      link.href = dataUrl;
      link.click();
      toast.success('¡Guardado! Listo para tus Stories 📸');
    } catch (err) {
      toast.error('Error al generar la imagen.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Filtrado de fotos para el muro principal
  const displayedPhotos = activeCategory === 'todos' 
    ? photos 
    : photos.filter(p => p.category === activeCategory);

  const polaroidRotations = ['-rotate-6', 'rotate-3', '-rotate-2', 'rotate-6'];
  const polaroidPositions = ['top-[5%] left-[5%]', 'top-[25%] right-[5%]', 'bottom-[35%] left-[10%]', 'bottom-[10%] right-[10%]'];

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white text-gray-900 pb-40 font-sans relative">
      <Toaster theme="light" position="top-center" />

      {/* HEADER SUPERIOR */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-gray-200 shadow-sm flex flex-col">
        <div className="p-4 flex justify-between items-center">
            <div className="flex flex-col">
            <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-arq-navy)]">
                CONGRESO <span className="text-[var(--color-arq-mustard)]">ARQ</span>
            </h1>
            <span className="text-[10px] uppercase tracking-widest text-[var(--color-arq-blue)]">
                {isAdminView ? 'MODO ADMINISTRADOR' : 'Galería Oficial'}
            </span>
            </div>
            
            <div className="flex items-center gap-2">
            {user?.email === ADMIN_EMAIL && !isAdminView && (
                <button onClick={() => setIsAdminView(true)} className="bg-red-500 text-white p-2 sm:px-4 sm:py-2 rounded-full font-bold shadow-md hover:bg-red-600 transition-all flex items-center gap-2">
                    <ShieldAlert size={18} />
                    <span className="hidden sm:inline text-sm">Moderar</span>
                </button>
            )}

            {!isAdminView && (
                <button onClick={openCollageGenerator} className="bg-gradient-to-r from-[var(--color-arq-mustard)] to-yellow-500 text-white p-2 sm:px-4 sm:py-2 rounded-full font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2">
                    <Wand2 size={18} />
                    <span className="hidden sm:inline text-sm">Collage</span>
                </button>
            )}

            {user ? (
                <div className="flex items-center gap-3 bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200 cursor-pointer" onClick={() => !isAdminView && openUserGallery(user.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full border-2 border-[var(--color-arq-mustard)] object-cover" />
                </div>
            ) : (
                <button onClick={handleLogin} className="bg-[var(--color-arq-navy)] hover:bg-[var(--color-arq-blue)] text-white px-6 py-2 rounded-full text-sm font-bold transition-colors shadow-md">
                Entrar
                </button>
            )}
            </div>
        </div>

        {/* NAVEGACIÓN DE DÍAS (SCROLL HORIZONTAL) */}
        {!isAdminView && (
            <div className="flex overflow-x-auto gap-2 px-4 py-3 bg-gray-50 border-t border-gray-100 scrollbar-hide">
                {CATEGORIES.map(c => (
                    <button
                        key={c.id}
                        onClick={() => setActiveCategory(c.id)}
                        className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${activeCategory === c.id ? 'bg-[var(--color-arq-navy)] text-white shadow-md' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                    >
                        {c.label}
                    </button>
                ))}
            </div>
        )}
      </header>

      {/* MURO PRINCIPAL */}
      <section className="p-4 max-w-7xl mx-auto mt-2">
        {displayedPhotos.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p>No hay fotos en esta categoría aún. ¡Sé el primero!</p>
          </div>
        ) : (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
            {displayedPhotos.map((photo, index) => (
              <div 
                key={photo.id} 
                onClick={() => openUserGallery(photo.user_id)}
                className={`relative break-inside-avoid w-full rounded-2xl overflow-hidden bg-gray-200 group shadow-lg hover:shadow-xl transition-shadow duration-300 ring-1 ring-gray-900/5 cursor-pointer ${index % 3 === 0 ? 'h-80' : index % 2 === 0 ? 'h-64' : 'h-72'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.image_url} alt="Foto del evento" className="absolute inset-0 w-full h-full object-cover opacity-95 group-hover:opacity-100 transition-all duration-500 group-hover:scale-105" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <p className="text-sm font-semibold text-white truncate flex items-center gap-2">
                    <ImageIcon size={14} className="text-[var(--color-arq-mustard)]"/> Ver perfil
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ZONA INFERIOR DE SUBIDA (Oculta en modo admin) */}
      {user && !isAdminView && (
        <div className="fixed bottom-6 left-0 right-0 flex flex-col items-center justify-center z-30 px-4 pointer-events-none gap-3">
          
          {/* Selector de día para la subida */}
          <div className="pointer-events-auto bg-white/90 backdrop-blur-md shadow-lg rounded-full px-4 py-2 border border-gray-200 flex items-center gap-2 text-sm animate-in slide-in-from-bottom-2">
             <span className="font-bold text-gray-500 text-xs">Destino:</span>
             <select
               value={uploadCategory}
               onChange={(e) => setUploadCategory(e.target.value)}
               className="bg-transparent font-bold outline-none text-[var(--color-arq-navy)] text-xs cursor-pointer"
             >
               {CATEGORIES.filter(c => c.id !== 'todos').map(c => (
                 <option key={c.id} value={c.id}>{c.label}</option>
               ))}
             </select>
          </div>

          <label className={`
            pointer-events-auto
            ${isUploading ? 'bg-[var(--color-arq-blue)]' : 'bg-gray-900'} 
            text-white flex items-center gap-3 px-8 py-4 rounded-full font-extrabold shadow-2xl 
            transition-all duration-300 transform hover:-translate-y-1 active:scale-95 cursor-pointer
            ring-4 ring-white/50
          `}>
            {isUploading ? <Loader2 size={24} className="animate-spin" /> : <Plus size={24} strokeWidth={4} />}
            <span className="tracking-wide">{isUploading ? 'PROCESANDO...' : 'SUBIR FOTOS'}</span>
            <input type="file" multiple accept="image/png, image/jpeg, image/webp" className="hidden" onChange={handleFileUpload} disabled={isUploading}/>
          </label>
        </div>
      )}

      {/* MODAL DE PERFIL Y MODAL DE ADMIN... (Se mantienen iguales) */}
      
      {selectedUserId && !isCollageOpen && !isAdminView && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={(selectedUserMeta?.avatar_url as string) || "https://via.placeholder.com/150"} alt="Avatar" className="w-10 h-10 rounded-full object-cover" />
                    <h2 className="font-bold">{(selectedUserMeta?.full_name as string) || "Estudiante"}</h2>
                </div>
                <button onClick={() => setSelectedUserId(null)} className="p-2 bg-gray-100 rounded-full"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {userPhotos.map((photo) => (
                    <div key={photo.id} className="aspect-square rounded-xl overflow-hidden shadow-sm relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.image_url} alt="Foto" className="w-full h-full object-cover" />
                        <div className="absolute top-2 right-2 bg-black/60 text-white text-[9px] px-2 py-1 rounded-full uppercase">{photo.category}</div>
                    </div>
                ))}
            </div>
        </div>
      )}

      {isAdminView && (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white animate-in fade-in duration-300">
            <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900 shadow-md">
                <div className="flex items-center gap-3 text-red-400">
                    <ShieldAlert size={24} />
                    <div>
                        <h2 className="font-bold leading-tight">Panel de Moderación</h2>
                        <p className="text-xs text-gray-400">Elimina fotos inapropiadas permanentemente</p>
                    </div>
                </div>
                <button onClick={() => setIsAdminView(false)} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-full transition-colors"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {photos.map((photo) => (
                        <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-800 border border-gray-700 group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photo.image_url} alt="Foto" className="w-full h-full object-cover opacity-80 group-hover:opacity-50 transition-opacity" />
                            <div className="absolute top-2 left-2 bg-black/80 text-white text-[9px] px-2 py-1 rounded-full">{photo.category}</div>
                            <button onClick={() => handleDeletePhoto(photo.id)} className="absolute inset-0 m-auto w-12 h-12 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity transform scale-75 group-hover:scale-100 hover:bg-red-500 shadow-xl">
                                <Trash2 size={24} className="text-white" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      )}

      {isCollageOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 animate-in fade-in duration-300">
            <div className="flex items-center justify-between p-4 text-white">
                <h2 className="font-bold flex items-center gap-2">
                  <Wand2 size={18} className="text-[var(--color-arq-mustard)]"/> 
                  Estilo {collageStyleType} Generado
                </h2>
                <div className="flex gap-2">
                  <button onClick={openCollageGenerator} className="text-xs bg-white/10 px-3 py-1.5 rounded-full hover:bg-white/20">Cambiar Estilo</button>
                  <button onClick={() => setIsCollageOpen(false)} className="p-1.5 bg-white/10 rounded-full hover:bg-white/20"><X size={20} /></button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto flex items-center justify-center p-4">
               <div ref={collageRef} className="relative w-full max-w-sm aspect-[9/16] shadow-2xl overflow-hidden rounded-md bg-white">
                  
                  {collageStyleType === 1 && (
                    <div className="absolute inset-0 bg-[var(--color-arq-navy)]">
                      <div className="absolute top-10 left-[-20px] text-white/10 text-9xl font-black select-none pointer-events-none">ARQ</div>
                      {collagePhotos.slice(0,4).map((photo, i) => (
                        <div key={photo.id} className={`absolute ${polaroidPositions[i]} ${polaroidRotations[i]} bg-white p-2 pb-10 shadow-2xl rounded-sm w-[45%] border border-gray-200`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.image_url} crossOrigin="anonymous" alt="Polaroid" className="w-full aspect-square object-cover" />
                        </div>
                      ))}
                      <div className="absolute bottom-10 w-full text-center pointer-events-none">
                         <h2 className="text-3xl font-black tracking-widest text-[var(--color-arq-mustard)] drop-shadow-lg">CONGRESO ARQ</h2>
                         <p className="text-white/80 text-xs font-bold tracking-[0.3em] mt-1">2026</p>
                      </div>
                    </div>
                  )}

                  {collageStyleType === 2 && (
                    <div className="absolute inset-0 bg-black flex flex-col justify-between p-4 py-12">
                      <div className="text-center mb-4">
                         <h2 className="text-lg font-black tracking-[0.5em] text-white">CONGRESO</h2>
                         <p className="text-[var(--color-arq-mustard)] text-xs tracking-widest">SINALOA 2026</p>
                      </div>
                      <div className="flex-1 flex flex-col gap-4 justify-center">
                        {collagePhotos.slice(0,3).map((photo) => (
                          <div key={photo.id} className="w-full aspect-[16/9] bg-gray-900 border-t-2 border-b-2 border-white/20 relative overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photo.image_url} crossOrigin="anonymous" alt="Film" className="w-full h-full object-cover opacity-90 sepia-[.30]" />
                          </div>
                        ))}
                      </div>
                      <div className="text-center mt-6 text-white/40 text-[10px] font-mono tracking-widest">[ RECUERDOS_ARCHIVADOS ]</div>
                    </div>
                  )}

                  {collageStyleType === 3 && (
                    <div className="absolute inset-0 bg-[#f4f4f4] p-6 flex flex-col">
                      <div className="mb-6 border-b-2 border-black pb-4">
                         <h2 className="text-4xl font-black text-black leading-none tracking-tighter">ARQUI<br/>TECTURA</h2>
                         <p className="text-black text-xs font-bold tracking-widest mt-2 uppercase">Semana Académica 26</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 flex-1">
                        {collagePhotos.slice(0,4).map((photo, i) => (
                          <div key={photo.id} className={`bg-gray-300 w-full overflow-hidden ${i === 0 ? 'col-span-2 aspect-[2/1]' : 'aspect-square'}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photo.image_url} crossOrigin="anonymous" alt="Editorial" className="w-full h-full object-cover grayscale-[20%]" />
                          </div>
                        ))}
                      </div>
                      <div className="mt-6 flex justify-between items-end">
                         <div className="w-12 h-12 bg-[var(--color-arq-mustard)] rounded-full"></div>
                         <p className="text-right text-[10px] font-bold text-gray-500 max-w-[50%]">CAPTURA EL MOMENTO, CONSTRUYE EL FUTURO.</p>
                      </div>
                    </div>
                  )}
               </div>
            </div>

            <div className="p-6 flex justify-center bg-black/50 backdrop-blur-md">
                <button onClick={downloadCollage} disabled={isDownloading} className="w-full max-w-sm bg-[var(--color-arq-mustard)] text-[var(--color-arq-navy)] flex justify-center items-center gap-2 py-4 rounded-full font-bold shadow-xl active:scale-95 transition-all disabled:opacity-70">
                   {isDownloading ? <Loader2 size={24} className="animate-spin" /> : <Download size={24} strokeWidth={3} />}
                   {isDownloading ? 'CREANDO IMAGEN...' : 'DESCARGAR COLLAGE'}
                </button>
            </div>
        </div>
      )}
    </main>
  );
}