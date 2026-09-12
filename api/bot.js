const { Telegraf } = require('telegraf');
const { initializeApp, getApps } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, increment, updateDoc, deleteDoc } = require('firebase/firestore');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = "https://galeria-verifiedmodels.vercel.app";
const ADMIN_IDS_ENV = (process.env.ADMIN_IDS || "").split(",").map(s=>s.trim()).filter(Boolean);

if (!getApps().length) {
  initializeApp({
    apiKey:"AIzaSyAIHevrpglvhHK3IsxpnkHlWpxnuf5o1So",
    authDomain:"galeria-verifiedmodels.firebaseapp.com",
    projectId:"galeria-verifiedmodels",
    storageBucket:"galeria-verifiedmodels.firebasestorage.app",
    messagingSenderId:"684551560793",
    appId:"1:684551560793:web:3730a07d8d6ec737e3db48"
  });
}
const db=getFirestore();

const bot = new Telegraf(BOT_TOKEN);

async function getConfig(){
  try{
    const s=await getDoc(doc(db,"config","bot"));
    if(s.exists()) return s.data();
  }catch(e){ console.log("getConfig err", e.message) }
  return {};
}

async function isAdmin(ctx){
  const id = String(ctx.from?.id || "");
  if(ADMIN_IDS_ENV.includes(id)) return true;
  try{ const c=await getConfig(); if(c.admins && c.admins.includes(id)) return true; }catch(e){}
  if(ADMIN_IDS_ENV.length===0) return true;
  return false;
}

function getMencion(ctx){
  if(!ctx?.from) return "amigo";
  const name = (ctx.from.first_name||"").replace(/</g,'').replace(/>/g,'');
  return name? `<a href="tg://user?id=${ctx.from.id}">${name}</a>` : "amigo";
}

function replaceVars(str, m={}, ctx=null){
  if(!str) return "";
  try{
    const total=(m.votosMalo||0)+(m.votosBueno||0);
    const pBueno=total?Math.round((m.votosBueno||0)/total*100):0;
    const lista=m.servicios?.map(s=>`• ${s}`).join('\n')||'• -';
    const mencion = ctx? getMencion(ctx) : "";
    return str.replaceAll('{mencion}', mencion)
     .replaceAll('{perfil}', m.perfil||'')
     .replaceAll('{username}', m.username||'')
     .replaceAll('{edad}', String(m.edad||''))
     .replaceAll('{nacionalidad}', m.nacionalidad||'')
     .replaceAll('{servicios}', m.servicios?.join(' • ')||'-')
     .replaceAll('{servicios_lista}', lista)
     .replaceAll('{descripcion}', m.descripcion||'')
     .replaceAll('{votos}', String(total))
     .replaceAll('{porcentajeBueno}', String(pBueno))
     .replaceAll('{porcentajeMalo}', String(100-pBueno))
     .replaceAll('{id}', m.id||'')
     .replaceAll('{canalFree}', m.canalFree||'https://t.me/')
     .replaceAll('{contacto}', m.contacto||`https://t.me/${m.username||''}`);
  }catch(e){ return str; }
}

function buildKeyboard(btnsDef=[], modelo={}, ctx=null){
  try{
    let rowsMap={};
    btnsDef.forEach(b=>{
      let text=replaceVars(b.text||"BOTON", modelo, ctx);
      let btn={text};
      if(b.style) btn.style=b.style;
      if(b.icon_custom_emoji_id) btn.icon_custom_emoji_id=String(b.icon_custom_emoji_id);
      if(b.type==='web_app') btn.web_app={url: replaceVars(b.url||WEBAPP_URL, modelo, ctx)};
      else if(b.type==='url') btn.url=replaceVars(b.url||"https://t.me/", modelo, ctx);
      else btn.callback_data=replaceVars(b.data||"lista", modelo, ctx);
      const r = b.row?? 0;
      if(!rowsMap[r]) rowsMap[r]=[]; rowsMap[r].push(btn);
    });
    return Object.keys(rowsMap).sort().map(k=>rowsMap[k]);
  }catch(e){ return [[{text:"💖 GALERIA", web_app:{url:WEBAPP_URL}}]]; }
}

function textoConPremiumToHtml(txt, entities){
  if(!entities?.length) return txt;
  let premiumLog=[];
  for(const e of entities) if(e.type==='custom_emoji') premiumLog.push({id:e.custom_emoji_id, base:txt.substring(e.offset, e.offset+e.length), offset:e.offset, length:e.length});
  if(!premiumLog.length) return txt;
  let res=txt;
  [...premiumLog].sort((a,b)=>b.offset-a.offset).forEach(p=>{ res = res.substring(0,p.offset) + `<tg-emoji emoji-id="${p.id}">${p.base}</tg-emoji>` + res.substring(p.offset+p.length); });
  return {html: res, ids: premiumLog.map(p=>p.id), log: premiumLog};
}

function getMediaModelo(m){
  const cands = [m.foto, m.foto_file_id, m.foto_url, m.fotoUrl, m.imagen, m.url, m.fotos?.[0]];
  for(let c of cands){ if(!c) continue; if(typeof c==='string' && c.length>10) return c; if(typeof c==='object' && c.file_id) return c.file_id; }
  return null;
}

let esperando={}; let plantillaTemp={};

// START - SIEMPRE RESPONDE
bot.start(async(ctx)=>{
  try{
    const uid = String(ctx.from.id);
    // check ban
    try{
      const uDoc = await getDoc(doc(db,"usuarios", uid));
      if(uDoc.exists() && uDoc.data().banned) return ctx.reply("🚫 Estás baneado");
    }catch(e){}
    // registro
    try{ await setDoc(doc(db,"usuarios", uid), {id:uid, first_name:ctx.from.first_name||"", username:ctx.from.username||"", fecha:new Date().toISOString(), last_start:Date.now()}, {merge:true}); }catch(e){}

    const c=await getConfig();
    const texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑\nBienvenid@ a la Galería VIP 💖", {}, ctx);
    const emojiBtn = c.bienvenida_emoji_premium || c.galeria_emoji_premium || "";
    const kb=buildKeyboard(c.bienvenida_botones||[
      {text:"💖 𝗩𝗘𝗥 𝗚𝗔𝗟𝗘𝗥𝗜𝗔 𝗩𝗜𝗥𝗧𝗨𝗔𝗟 💖", type:"web_app", url:WEBAPP_URL, style:"success", row:0, icon_custom_emoji_id: emojiBtn},
      {text:"👑 𝗩𝗘𝗥 𝗟𝗜𝗦𝗧𝗔 𝗗𝗘 𝗠𝗢𝗗𝗘𝗟𝗢𝗦 👑", type:"callback", data:"lista", style:"primary", row:1, icon_custom_emoji_id: emojiBtn}
    ], {}, ctx);

    const media=c.bienvenida_media||c.bienvenida_media_file_id;
    if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
    await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.error("START FAIL", e); await ctx.reply("Hola 👑 bienvenid@\nUsa /admin si eres admin",{reply_markup:{inline_keyboard:[[{text:"💖 GALERIA", web_app:{url:WEBAPP_URL}}]]}}); }
});

bot.command('cancel', async(ctx)=>{ delete esperando[ctx.from.id]; delete plantillaTemp[ctx.from.id]; await ctx.reply("✅ Cancelado"); });
bot.command('addadmin', async(ctx)=>{ if(!(await isAdmin(ctx))) return; const n=ctx.message.text.split(' ')[1]; if(!n) return ctx.reply("Usa: /addadmin ID"); const c=await getConfig(); const a=c.admins||[]; if(!a.includes(n)) a.push(String(n)); await setDoc(doc(db,"config","bot"),{admins:a},{merge:true}); await ctx.reply(`✅ Admin ${n} agregado`); });
bot.command('deladmin', async(ctx)=>{ if(!(await isAdmin(ctx))) return; const n=ctx.message.text.split(' ')[1]; const c=await getConfig(); const a=(c.admins||[]).filter(x=>x!==String(n)); await setDoc(doc(db,"config","bot"),{admins:a},{merge:true}); await ctx.reply(`✅ Admin ${n} eliminado`); });
bot.command('ban', async(ctx)=>{ if(!(await isAdmin(ctx))) return; const n=ctx.message.text.split(' ')[1]; if(!n) return ctx.reply("Usa: /ban ID"); await setDoc(doc(db,"usuarios", String(n)), {banned:true},{merge:true}); await ctx.reply(`🚫 Baneado ${n}`); });
bot.command('unban', async(ctx)=>{ if(!(await isAdmin(ctx))) return; const n=ctx.message.text.split(' ')[1]; await setDoc(doc(db,"usuarios", String(n)), {banned:false},{merge:true}); await ctx.reply(`✅ Desbaneado ${n}`); });
bot.command('admin', async(ctx)=>{ if(!(await isAdmin(ctx))) return ctx.reply("❌ No eres admin"); await ctx.reply("👑 PANEL",{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"👋🏻 BIENVENIDA", callback_data:"panel_bienvenida"},{text:"🖼️ GALERIA", callback_data:"panel_galeria"}], [{text:"👤 USUARIOS", callback_data:"panel_usuarios"},{text:"📝 PLANTILLAS", callback_data:"panel_plantillas"}], [{text:"🌐 WEB", web_app:{url:"https://bot-galeria-verified.vercel.app/admin.html"}}]]}}); });

bot.action('panel_bienvenida', async(ctx)=>{ await ctx.answerCbQuery(); const c=await getConfig(); await ctx.reply(`Bienvenida: ${(c.bienvenida_texto||'').slice(0,200)}\nEmoji: ${c.bienvenida_emoji_premium||'no'}`,{reply_markup:{inline_keyboard:[[{text:"📸 Foto", callback_data:"edit_bienvenida_foto"},{text:"📝 Texto", callback_data:"edit_bienvenida_texto"}], [{text:"🧩 Emoji botones", callback_data:"edit_bienvenida_emoji"}], [{text:"👁️ Preview", callback_data:"preview_start"}], [{text:"⬅️ Volver", callback_data:"back_panel"}]]}}); });
bot.action('panel_galeria', async(ctx)=>{ await ctx.answerCbQuery(); const c=await getConfig(); await ctx.reply(`Galeria foto: ${c.galeria_media?'✅':'❌'} Emoji: ${c.galeria_emoji_premium||'no'}`,{reply_markup:{inline_keyboard:[[{text:"📸 Foto", callback_data:"edit_galeria_foto"},{text:"📝 Texto", callback_data:"edit_galeria_texto"}], [{text:"🧩 Emoji", callback_data:"edit_galeria_emoji"}], [{text:"⬅️ Volver", callback_data:"back_panel"}]]}}); });
bot.action('panel_usuarios', async(ctx)=>{ await ctx.answerCbQuery(); const snap=await getDocs(collection(db,"usuarios")).catch(()=>({size:0})); await ctx.reply(`Usuarios: ${snap.size}\n/ban ID\n/unban ID\n/addadmin ID`,{reply_markup:{inline_keyboard:[[{text:"⬅️ Volver", callback_data:"back_panel"}]]}}); });
bot.action('panel_plantillas', async(ctx)=>{ await ctx.answerCbQuery(); const c=await getConfig(); const snap=await getDocs(collection(db,"plantillas")).catch(()=>({docs:[]})); let kb=[]; snap.docs.slice(0,10).forEach(d=>{ kb.push([{text:`📄 ${d.data().nombre||d.id.slice(-4)}`, callback_data:`plantilla_use_${d.id}`},{text:"🗑️", callback_data:`plantilla_del_${d.id}`}]) }); kb.push([{text:"📝 Nueva Plantilla", callback_data:"edit_plantilla_texto"}]); kb.push([{text:"⬅️ Volver", callback_data:"back_panel"}]); await ctx.reply(`Actual: ${(c.plantilla_texto||'').slice(0,300)}\nGuardadas: ${snap.docs.length}`,{reply_markup:{inline_keyboard:kb}}); });
bot.action(/plantilla_use_(.*)/, async(ctx)=>{ if(!(await isAdmin(ctx))) return; const id=ctx.match[1]; const s=await getDoc(doc(db,"plantillas",id)); if(!s.exists()) return ctx.answerCbQuery("No existe"); await setDoc(doc(db,"config","bot"),{plantilla_texto:s.data().texto},{merge:true}); await ctx.answerCbQuery("✅ Activada"); await ctx.reply(`✅ Plantilla ${s.data().nombre} activada`); });
bot.action(/plantilla_del_(.*)/, async(ctx)=>{ await deleteDoc(doc(db,"plantillas",ctx.match[1])); await ctx.answerCbQuery("Eliminada"); });
bot.action('back_panel', async(ctx)=>{ await ctx.answerCbQuery(); await ctx.reply("/admin"); });
bot.action('edit_bienvenida_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_bienvenida'; await ctx.reply("📸 Manda FOTO como FOTO"); });
bot.action('edit_bienvenida_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_bienvenida'; await ctx.reply("📝 Manda texto {mencion} + premium"); });
bot.action('edit_bienvenida_emoji', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='emoji_bienvenida'; await ctx.reply("🧩 Manda SOLO un emoji premium"); });
bot.action('edit_galeria_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_galeria'; await ctx.reply("📸 Manda foto GALERIA"); });
bot.action('edit_galeria_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_galeria'; await ctx.reply("📝 Manda texto galeria {mencion}"); });
bot.action('edit_galeria_emoji', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='emoji_galeria'; await ctx.reply("🧩 Manda emoji premium para botones galeria/perfil"); });
bot.action('edit_plantilla_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_plantilla'; await ctx.reply("📝 Manda plantilla {perfil} {mencion}\nLuego te pido nombre"); });

bot.on(['photo'], async(ctx)=>{
  if(!(await isAdmin(ctx))) return;
  const fileId = ctx.message.photo[ctx.message.photo.length-1].file_id;
  const st=esperando[ctx.from.id];
  if(st==='foto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_media:fileId, bienvenida_media_file_id:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto bienvenida guardada"); }
  if(st==='foto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_media:fileId, galeria_media_file_id:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto galeria guardada"); }
});

bot.on('text', async(ctx)=>{
  const txt=ctx.message.text; if(txt.startsWith('/')) return;
  if(!(await isAdmin(ctx))) return;
  const st=esperando[ctx.from.id]; if(!st) return;
  const conv=textoConPremiumToHtml(txt, ctx.message.entities||[]);
  const htmlText=typeof conv==='object'?conv.html:conv;
  const premiumIds=typeof conv==='object'?conv.ids:[];
  const first=premiumIds[0]||txt.trim();

  if(st==='texto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_texto:htmlText},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Bienvenida guardada"); }
  if(st==='emoji_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_emoji_premium:String(first), galeria_emoji_premium:String(first)},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Emoji botones: ${first}`); }
  if(st==='texto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_texto:htmlText},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Galeria guardada"); }
  if(st==='emoji_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_emoji_premium:String(first), bienvenida_emoji_premium:String(first)},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Emoji: ${first}`); }
  if(st==='texto_plantilla'){ plantillaTemp[ctx.from.id]={texto:htmlText}; esperando[ctx.from.id]='nombre_plantilla'; return ctx.reply("Ahora manda el NOMBRE de la plantilla"); }
  if(st==='nombre_plantilla'){ const temp=plantillaTemp[ctx.from.id]; const nombre=txt.slice(0,30); const newId=Date.now().toString(); await setDoc(doc(db,"plantillas",newId),{nombre, texto:temp.texto, fecha:new Date().toISOString()}); await setDoc(doc(db,"config","bot"),{plantilla_texto:temp.texto},{merge:true}); delete esperando[ctx.from.id]; delete plantillaTemp[ctx.from.id]; return ctx.reply(`✅ Plantilla "${nombre}" guardada y activada`); }
});

bot.action('lista', async(ctx)=>{
  try{
    await ctx.answerCbQuery(); const c=await getConfig();
    const texto=replaceVars(c.galeria_texto||"👑 GALERIA {mencion}", {}, ctx);
    let snap; try{ snap=await getDocs(query(collection(db,"modelos"),orderBy("fecha","desc"))); }catch{ snap=await getDocs(collection(db,"modelos")); }
    let keyboard=[]; let row=[]; let idx=0;
    snap.forEach(d=>{
      const m=d.data(); const nombre=(m.perfil||d.id).replace(/@/g,'').trim();
      const btn={text:nombre, callback_data:`ver_${d.id}`};
      const emoji=c.galeria_emoji_premium||c.bienvenida_emoji_premium; if(emoji) btn.icon_custom_emoji_id=String(emoji);
      row.push(btn); idx++; if(row.length===2){ keyboard.push(row); row=[]; }
    });
    if(row.length>0) keyboard.push(row);
    keyboard.push([{text:"𝗩𝗘𝗥 𝗚𝗔𝗟𝗘𝗥𝗜𝗔 𝗩𝗜𝗥𝗧𝗨𝗔𝗟 💖", web_app:{url:WEBAPP_URL}}]);
    const media=c.galeria_media||c.galeria_media_file_id;
    try{ await ctx.deleteMessage(); }catch(e){}
    if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}}); return; }catch(e){} }
    await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
  }catch(e){ console.error("lista", e); }
});

bot.action(/ver_(.*)/, async(ctx)=>{
  try{
    await ctx.answerCbQuery();
    const id=ctx.match[1].split('_')[0];
    const snap=await getDoc(doc(db,"modelos",id)); if(!snap.exists()) return ctx.reply("❌ No existe");
    const m={id:snap.id,...snap.data()}; const c=await getConfig();
    const caption=replaceVars(c.plantilla_texto||"👑 {perfil} 👑\nHola {mencion}\nVotos: {votos}", m, ctx);
    const canalFree=m.canalFree||"https://t.me/"; const contacto=m.contacto||`https://t.me/${m.username||''}`;
    const emoji=c.galeria_emoji_premium||""; const eObj=emoji?{icon_custom_emoji_id:String(emoji)}:{};
    const kb=[[{text:"💖 𝗩𝗘𝗥 𝗣𝗘𝗥𝗙𝗜𝗟 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗢 💖", web_app:{url:`${WEBAPP_URL}?m=${m.id}`},...eObj}], [{text:`👍 Bueno ${m.votosBueno||0}`, callback_data:`voto_bueno_${m.id}`,...eObj},{text:`👎 Malo ${m.votosMalo||0}`, callback_data:`voto_malo_${m.id}`,...eObj}], [{text:"💎 CANAL FREE", url:canalFree,...eObj},{text:"💬 CONTACTAR", url:contacto,...eObj}], [{text:"👈🏻 VOLVER", callback_data:"lista"},{text:"👑 INICIO", callback_data:"inicio"}]];
    const media=getMediaModelo(m);
    try{ await ctx.deleteMessage(); }catch(e){}
    if(media){ try{ await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){ try{ await ctx.replyWithPhoto({url:media},{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e2){} } }
    await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.error("ver_", e); }
});

bot.action('inicio', async(ctx)=>{ await ctx.answerCbQuery(); const c=await getConfig(); const texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑", {}, ctx); const media=c.bienvenida_media; try{ await ctx.deleteMessage(); }catch(e){} if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:[[{text:"💖 GALERIA", web_app:{url:WEBAPP_URL}}]]}}); return; }catch(e){} } await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:[[{text:"💖 GALERIA", web_app:{url:WEBAPP_URL}}]]}}); });
bot.action(/voto_(bueno|malo)_(.*)/, async(ctx)=>{ try{ await ctx.answerCbQuery("✅"); const tipo=ctx.match[1]; const id=ctx.match[2]; const ref=doc(db,"modelos",id); if(tipo==='bueno') await updateDoc(ref,{votosBueno:increment(1)}).catch(async()=>{ await setDoc(ref,{votosBueno:1},{merge:true}); }); else await updateDoc(ref,{votosMalo:increment(1)}).catch(async()=>{ await setDoc(ref,{votosMalo:1},{merge:true}); }); const snap=await getDoc(ref); const m={id:snap.id,...snap.data()}; const c=await getConfig(); const caption=replaceVars(c.plantilla_texto||"👑 {perfil} Votos {votos}", m, ctx); const media=getMediaModelo(m); const kb=[[{text:`👍 Bueno ${m.votosBueno||0}`, callback_data:`voto_bueno_${m.id}`},{text:`👎 Malo ${m.votosMalo||0}`, callback_data:`voto_malo_${m.id}`}], [{text:"👈🏻 VOLVER", callback_data:"lista"},{text:"👑 INICIO", callback_data:"inicio"}]]; try{ await ctx.deleteMessage(); }catch(e){} if(media){ try{ await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} } await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); }catch(e){} });
bot.action('preview_start', async(ctx)=>{ await ctx.answerCbQuery(); const c=await getConfig(); const texto=replaceVars(c.bienvenida_texto||"Hola {mencion}",{},ctx); const media=c.bienvenida_media; try{ await ctx.deleteMessage(); }catch(e){} if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML'}); return; }catch(e){} } await ctx.reply(texto,{parse_mode:'HTML'}); });

module.exports = async(req,res)=>{
  if(req.method==='GET') return res.status(200).send('Bot OK FINAL');
  try{ await bot.handleUpdate(req.body); return res.status(200).send('ok'); }catch(e){ console.error(e); return res.status(200).send('ok'); }
};
