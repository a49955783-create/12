import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'

export default function Home(){
  const [recipient, setRecipient] = useState('')
  const [deputy, setDeputy] = useState('')
  const [people, setPeople] = useState([]) // {name, code, status}
  const [imageUrl, setImageUrl] = useState(null)
  const [finalText, setFinalText] = useState('')
  const [busy, setBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const imgRef = useRef(null)
  const canvasRef = useRef(null)

  // theme toggle
  function toggleTheme(){
    const root = document.documentElement
    const isDark = root.classList.toggle('dark')
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }

  // prepare canvas when image loads
  useEffect(()=>{
    if(!imageUrl) return
    const img = imgRef.current
    if(!img) return
    const handle = ()=>{
      const cvs = canvasRef.current
      const ctx = cvs.getContext('2d', { willReadFrequently: true })
      cvs.width = img.naturalWidth
      cvs.height = img.naturalHeight
      ctx.drawImage(img, 0, 0)
    }
    img.addEventListener('load', handle)
    return ()=> img.removeEventListener('load', handle)
  },[imageUrl])

  // paste handler
  useEffect(()=>{
    function onPaste(e){
      const items = e.clipboardData?.items || []
      for(const it of items){
        if(it.type && it.type.startsWith('image/')){
          const file = it.getAsFile()
          const url = URL.createObjectURL(file)
          setImageUrl(url)
          e.preventDefault()
          break
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return ()=> window.removeEventListener('paste', onPaste)
  },[])

  function onFile(e){
    const f = e.target.files?.[0]
    if(!f) return
    const url = URL.createObjectURL(f)
    setImageUrl(url)
  }

  function hsvFromRgb(r,g,b){
    r/=255; g/=255; b/=255
    const max=Math.max(r,g,b), min=Math.min(r,g,b)
    let h,s,v=max
    const d=max-min
    s = max===0?0:d/max
    if(max===min){ h=0 }
    else{
      switch(max){
        case r: h=(g-b)/d + (g<b?6:0); break
        case g: h=(b-r)/d + 2; break
        case b: h=(r-g)/d + 4; break
      }
      h/=6
    }
    return { h:h*360, s, v }
  }

  function classifyHue(avg){
    if(avg.s < 0.35 || avg.v < 0.3) return 'unknown'
    const h = avg.h
    if(h >= 70 && h <= 170) return 'green'
    if(h >= 260 && h <= 320) return 'purple'
    if(h <= 20 || h >= 340) return 'red'
    return 'unknown'
  }

  function sampleColorNearBBox(b){
    const cvs = canvasRef.current
    if(!cvs) return 'unknown'
    const ctx = cvs.getContext('2d', { willReadFrequently: true })
    const w = cvs.width, h = cvs.height
    const x0 = Math.max(0, b.x0|0), x1 = Math.min(w-1, b.x1|0)
    const y0 = Math.max(0, b.y0|0), y1 = Math.min(h-1, b.y1|0)
    const lineH = Math.max(1, y1-y0)
    const pad = Math.floor(lineH * 0.2)
    const boxW = Math.max(8, Math.floor(lineH * 0.8))
    const midY = Math.floor((y0+y1)/2)

    function avgHSV(sx, sy, ex, ey){
      sx=Math.max(0,sx); sy=Math.max(0,sy); ex=Math.min(w-1,ex); ey=Math.min(h-1,ey);
      if(ex<=sx || ey<=sy) return {h:0,s:0,v:0,count:0}
      const data = ctx.getImageData(sx, sy, ex-sx, ey-sy).data
      let sumH=0,sumS=0,sumV=0,cnt=0
      for(let i=0;i<data.length;i+=4){
        const r=data[i], g=data[i+1], b=data[i+2], a=data[i+3]
        if(a<10) continue
        const hsv = hsvFromRgb(r,g,b)
        if(hsv.s>0.5 && hsv.v>0.35){
          sumH+=hsv.h; sumS+=hsv.s; sumV+=hsv.v; cnt++
        }
      }
      if(cnt===0) return {h:0,s:0,v:0,count:0}
      return {h:sumH/cnt, s:sumS/cnt, v:sumV/cnt, count:cnt}
    }

    const rightBox = { sx: x1 + pad, sy: midY - Math.floor(boxW/2), ex: x1 + pad + boxW, ey: midY + Math.floor(boxW/2) }
    let avg = avgHSV(rightBox.sx, rightBox.sy, rightBox.ex, rightBox.ey)
    let cls = classifyHue(avg)
    if(cls!=='unknown') return cls

    const leftBox = { sx: x0 - pad - boxW, sy: midY - Math.floor(boxW/2), ex: x0 - pad, ey: midY + Math.floor(boxW/2) }
    avg = avgHSV(leftBox.sx, leftBox.sy, leftBox.ey, leftBox.ey)
    cls = classifyHue(avg)
    if(cls!=='unknown') return cls

    const innerBox = { sx: x1 - boxW, sy: midY - Math.floor(boxW/2), ex: x1, ey: midY + Math.floor(boxW/2) }
    avg = avgHSV(innerBox.sx, innerBox.sy, innerBox.ex, innerBox.ey)
    cls = classifyHue(avg)
    return cls
  }

  function parseNameCode(text){
    text = text.replace(/[🟢🟣🔴●•■□▪▫◦]/g, '').trim()
    const m = text.match(/^(.*?)[\s\-–]+([A-Za-z]{1,4}-?\d{1,4})$/)
    if(m){
      return { name: m[1].trim(), code: m[2].trim() }
    }
    return { name: text, code: '' }
  }

  async function extract(){
    if(!imageUrl){ alert('أضف صورة أولاً (رفع ملف أو لصق بالكيبورد)'); return }
    setBusy(true); setStatusMsg('جاري قراءة النص من الصورة…')
    try{
      // @ts-ignore Tesseract from Script tag
      const worker = await Tesseract.createWorker()
      await worker.loadLanguage('ara+eng')
      await worker.initialize('ara+eng')
      const { data } = await worker.recognize(imageUrl, { tessedit_char_blacklist: '•●◦▪■□' })
      await worker.terminate()

      const lines = data.lines || (data.words ? data.words.map(w=>({ text: w.text, bbox: w.bbox })) : [])
      const arr = []
      for(const line of lines){
        const txt = (line.text || '').trim()
        if(!txt) continue
        if(!/[\u0600-\u06FF]/.test(txt)) continue
        const { name, code } = parseNameCode(txt)
        if(!name) continue
        const bbox = line.bbox || line
        const cls = sampleColorNearBBox(bbox)
        let status = 'field'
        if(cls==='purple') status='busy'
        else if(cls==='red') status='oos'
        else status='field'
        arr.push({ name, code, status })
      }
      const map = new Map()
      for(const p of arr){
        const key = (p.name+'|'+p.code).trim()
        if(!map.has(key)) map.set(key, p)
      }
      const unique = Array.from(map.values())
      setPeople(unique)
      setStatusMsg('تم استخراج الأسماء وتحديد الحالات.')
    }catch(e){
      console.error(e)
      alert('حدث خطأ أثناء القراءة. جرّب صورة أوضح أو قصّ الجزء المطلوب.')
      setStatusMsg('')
    }finally{
      setBusy(false)
    }
  }

  function generate(){
    if(!recipient && !deputy){
      alert('الرجاء منك كتابة المستلم أو النائب')
      return
    }
    const inField = people.filter(p=>p.status!=='oos')
    const oos = people.filter(p=>p.status==='oos')
    const totalField = inField.length + (recipient ? 1 : 0)
    const namesList = inField.map(p => `- ${p.name}${p.code? ' ' + p.code : ''}${p.status==='busy' ? ' (مشغول)' : ''}`).join('\n')
    const text = `📌 استلام العمليات 📌

المستلم : ${recipient}

النائب : ${deputy}

عدد و اسماء الوحدات الاسعافيه في الميدان : {${totalField}}
${namesList}

خارج الخدمه : (${oos.length})

🎙️ تم استلام العمليات و جاهزون للتعامل مع البلاغات

الملاحظات : تحديث`
    setFinalText(text)
  }

  async function copyFinal(){
    if(!finalText) return
    try{
      await navigator.clipboard.writeText(finalText)
      alert('تم النسخ ✅')
    }catch{
      alert('تعذّر النسخ تلقائيًا. انسخ يدويًا.')
    }
  }

  return (
    <div className="wrap" dir="rtl">
      <Script src="https://unpkg.com/tesseract.js@v5/dist/tesseract.min.js" strategy="beforeInteractive" />
      <div className="card">
        <header className="top">
          <h1>🏥 نموذج تحديث سجل مركز العمليات للصحة</h1>
          <button className="toggle" onClick={toggleTheme}>الوضع الداكن/الفاتح</button>
        </header>
        <div className="muted">ارفع أو الصق صورة (Ctrl+V) لاستخراج الأسماء والأكواد تلقائيًا. يتم تحديد الحالة من لون النقطة بجانب الاسم.
          الإخراج النهائي نص فقط (بدون ألوان). «المستلم» يُحتسب ضمن عدد الميدان ولا يُعرض ضمن الأسماء.
        </div>
      </div>

      <div className="card">
        <div className="row row-2">
          <div>
            <label>المستلم</label>
            <input value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="اكتب اسم المستلم" />
          </div>
          <div>
            <label>النائب</label>
            <input value={deputy} onChange={e=>setDeputy(e.target.value)} placeholder="اكتب اسم النائب" />
          </div>
        </div>

        <div style={{marginTop:10}} className="row row-2">
          <div>
            <label>📷 ارفع صورة</label>
            <input type="file" accept="image/*" onChange={onFile} />
          </div>
          <div>
            <label>أو ألصق صورة هنا (Ctrl+V)</label>
            <div className="drop">الصق صورة هنا أو اسحبها وأفلِتها</div>
          </div>
        </div>

        {imageUrl && (
          <div id="previewWrap" style={{marginTop:10}}>
            <img ref={imgRef} src={imageUrl} className="img" alt="preview" />
            <canvas ref={canvasRef} style={{display:'none'}} />
            <div className="small">تم تحميل الصورة — اضغط «استخراج من الصورة» لقراءة الأسماء وتحديد الحالة من اللون.</div>
          </div>
        )}

        <div className="flex" style={{marginTop:10}}>
          <button onClick={extract} disabled={busy}>{busy ? 'جاري الاستخراج…' : 'استخراج من الصورة (OCR)'}</button>
          <button className="ghost" onClick={()=>{ setPeople([]); setImageUrl(null); setFinalText(''); setStatusMsg(''); setRecipient(''); setDeputy(''); }}>إعادة تعيين</button>
        </div>
        {statusMsg && <div className="small" style={{marginTop:8}}>{statusMsg}</div>}
      </div>

      <div className="card">
        <div className="muted" style={{marginBottom:8}}>القائمة المستخرجة (يمكن تعديل الحالة يدويًا):</div>
        <div className="list">
          {people.map((p,idx)=>(
            <div className="item" key={idx}>
              <input value={p.name} onChange={e=>{
                const copy=[...people]; copy[idx].name=e.target.value; setPeople(copy)
              }} />
              <input style={{maxWidth:120}} value={p.code} placeholder="الكود" onChange={e=>{
                const copy=[...people]; copy[idx].code=e.target.value; setPeople(copy)
              }} />
              <select style={{maxWidth:180}} value={p.status} onChange={e=>{
                const copy=[...people]; copy[idx].status=e.target.value; setPeople(copy)
              }}>
                <option value="field">في الميدان</option>
                <option value="busy">مشغول</option>
                <option value="oos">خارج الخدمة</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex">
          <button onClick={generate}>توليد النص النهائي</button>
          <button className="ghost" onClick={copyFinal} disabled={!finalText}>نسخ النتيجة</button>
        </div>
        <div className="out" dir="rtl" style={{marginTop:10}}>{finalText}</div>
      </div>
    </div>
  )
}
