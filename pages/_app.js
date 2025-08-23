import '@/styles/globals.css'
import { useEffect, useState } from 'react'

export default function App({ Component, pageProps }){
  const [mounted, setMounted] = useState(false);
  useEffect(()=>{
    const saved = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    if(saved === 'dark') document.documentElement.classList.add('dark');
    setMounted(true);
  },[]);
  if(!mounted) return null;
  return <Component {...pageProps} />
}
