const { Telegraf } = require('telegraf');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, increment, updateDoc, deleteDoc } = require('firebase/firestore');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = "https://galeria-verifiedmodels.vercel.app";
const ADMIN_IDS_ENV = (process.env.ADMIN_IDS || "").split(",").map(s=>s.trim()).filter(Boolean);
const fbApp = initializeApp({ apiKey:"AIzaSyAIHevrpglvhHK3IsxpnkHlWpxnuf5o1So",authDomain:"galeria-verifiedmodels.firebaseapp.com",projectId:"galeria-verifiedmodels",storageBucket:"galeria-verifiedmodels.firebasestorage.app",messagingSenderId:"684551560793",appId:"1:684551560793:web:3730a07d8d6ec737e3db48"});
const db=getFirestore(fbApp);
const bot = new Telegraf(BOT_TOKEN);

async function getConfig(){ try{ let s=await getDoc(doc(db,"config","bot")); if(s.exists()) return s.data(); }catch(e){} return {}; }
async function isAdmin(ctx){
  let id = String(ctx.from.id);
  if(ADMIN_IDS_ENV.includes(id)) return true;
  try{ let c=await getConfig(); if(c.admins && c.admins.includes(id)) return true; }catch(e){}
  if(ADMIN_IDS_ENV.length===0) return true; // si no hay env, deja entrar al primero
  return false;
}
function getMencion(ctx){
  if(!ctx ||!ctx.from) return "";
  let name = (ctx.from.first_name || "").replace(/</g,'').replace(/>/g,'');
  return name? `<a href="tg://user?id=${ctx.from.id}">${name}</a>` : "";
}
function replaceVars(str, m={}, ctx=null){
  if(!str) return "";
  let total=(m.votosMalo||0)+(m.votosBueno||0);
  let pBueno=total?Math.round((m.votosBueno||0)/total*100):0;
  let lista=m.servicios?.map(s=>`• ${s}`).join('\n')||'• -';
  let mencion = ctx? getMencion(ctx) : "";
  return str.replaceAll('{mencion}', mencion).replaceAll('{perfil}', m.perfil||'').replaceAll('{username}', m.username||'').replaceAll('{edad}', m.edad||'').replaceAll('{nacionalidad}', m.nacionalidad||'').replaceAll('{servicios}', m.servicios?.join(' • ')||'-').replaceAll('{servicios_lista}', lista).replaceAll('{descripcion}', m.descripcion||'').replaceAll('{votos}', total).replaceAll('{porcentajeBueno}', pBueno).replaceAll('{porcentajeMalo}', 100-pBueno).replaceAll('{id}', m.id||'').replaceAll('{canalFree}', m.canalFree||'https://t.me/').replaceAll('{contacto}', m.contacto||`https://t.me/${m.username||''}`);
}
function buildKeyboard(btnsDef, modelo={}, ctx=null){
  let rowsMap={};
  btnsDef.forEach(b=>{
    let text=replaceVars(b.text, modelo, ctx);
    let btn={text}; if(b.style) btn.style=b.style; if(b.icon_custom_emoji_id) btn.icon_custom_emoji_id=b.icon_custom_emoji_id;
    if(b.type==='web_app') btn.web_app={url: replaceVars(b.url||"", modelo, ctx)}; else if(b.type==='url') btn.url=replaceVars(b.url||"", modelo, ctx); else btn.callback_data=replaceVars(b.data||"", modelo, ctx);
    if(!rowsMap[b.row]) rowsMap[b.row]=[]; rowsMap[b.row].push(btn);
  });
  return Object.keys(rowsMap).sort().map(k=>rowsMap[k]);
}
function textoConPremiumToHtml(txt, entities){
  if(!entities ||!entities.length) return txt;
  let premiumLog=[];
  for(const e of entities) if(e.type==='custom_emoji') premiumLog.push({id:e.custom_emoji_id, base:txt.substring(e.offset, e.offset+e.length), offset:e.offset, length:e.length});
  if(!premiumLog.length) return txt;
  let res=txt;
  [...premiumLog].sort((a,b)=>b.offset-a.offset).forEach(p=>{ res = res.substring(0,p.offset) + `<tg-emoji emoji-id="${p.id}">${p.base}</tg-emoji>` + res.substring(p.offset+p.length); });
  return {html: res, ids: premiumLog.map(p=>p.id), log: premiumLog};
}
// FIX FOTOS - saca de cualquier campo
function getMediaModelo(m){
  let cands = [m.foto, m.foto_file_id, m.foto_url, m.fotoUrl, m.image, m.imagen, m.url, m.imagen_principal, m.foto_principal, m.media, (m.fotos && m.fotos[0]), (m.galeria && m.galeria[0])];
  for(let c of cands){
    if(!c) continue;
    if(typeof c==='string' && c.length>5) return c;
    if(typeof c==='object' && c.file_id) return c.file_id;
    if(typeof c==='object' && c.url) return c.url;
  }
  return null;
}
let esperando={};

bot.start(async(ctx)=>{
  try{
    // REGISTRO USUARIOS
    await setDoc(doc(db,"usuarios", String(ctx.from.id)), {id: String(ctx.from.id), first_name: ctx.from.first_name||"", username: ctx.from.username||"", fecha: new Date().toISOString(), last_start: Date.now()}, {merge:true});
    let c=await getConfig();
    let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑\nBienvenid@ a Galeria", {}, ctx);
    let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 𝗩𝗘𝗥 𝗚𝗔𝗟𝗘𝗥𝗜𝗔 𝗩𝗜𝗥𝗧𝗨𝗔𝗟 💖", type:"web_app", url:WEBAPP_URL, style:"success", row:0},{text:"👑 𝗩𝗘𝗥 𝗟𝗜𝗦𝗧𝗔 𝗗𝗘 𝗠𝗢𝗗𝗘𝗟𝗢𝗦 👑", type:"callback", data:"lista", style:"primary", row:1}], {}, ctx);
    let media = c.bienvenida_media || c.bienvenida_media_file_id || c.bienvenida_media_url;
    if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){ console.log("Error foto bienvenida:", e.message)} }
    await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.error("START ERROR", e); }
});

// COMANDOS ADMIN NUEVOS
bot.command('addadmin', async(ctx)=>{
  if(!(await isAdmin(ctx))) return ctx.reply("❌ No eres admin");
  let newId = ctx.message.text.split(' ')[1]; if(!newId) return ctx.reply("Usa: /addadmin 123456789");
  let c=await getConfig(); let admins = c.admins||[]; if(!admins.includes(newId)) admins.push(newId);
  await setDoc(doc(db,"config","bot"),{admins},{merge:true}); await ctx.reply(`✅ Admin ${newId} agregado`);
});
bot.command('deladmin', async(ctx)=>{
  if(!(await isAdmin(ctx))) return;
  let delId = ctx.message.text.split(' ')[1]; let c=await getConfig(); let admins=(c.admins||[]).filter(x=>x!==delId);
  await setDoc(doc(db,"config","bot"),{admins},{merge:true}); await ctx.reply(`✅ Admin ${delId} eliminado`);
});
bot.command('admins', async(ctx)=>{
  if(!(await isAdmin(ctx))) return;
  let c=await getConfig(); await ctx.reply(`Admins ENV: ${ADMIN_IDS_ENV.join(',')}\nAdmins Firestore: ${(c.admins||[]).join(',')}`);
});

bot.command('admin', async(ctx)=>{
  if(!(await isAdmin(ctx))) return ctx.reply("❌ No eres admin");
  await ctx.reply(`👑 <b>𝗣𝗔𝗡𝗘𝗟 𝗗𝗘 𝗔𝗗𝗠𝗜𝗡𝗦</b> 👑`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[
    [{text:"👋🏻 𝗕𝗜𝗘𝗡𝗩𝗘𝗡𝗜𝗗𝗔", callback_data:"panel_bienvenida", style:"primary"}, {text:"🖼️ 𝙂𝘼𝙇𝙀𝙍𝙄𝘼", callback_data:"panel_galeria", style:"primary"}],
    [{text:"👤 𝙐𝙎𝙐𝘼𝙍𝙄𝙊𝙎", callback_data:"panel_usuarios", style:"danger"}, {text:"📝 𝙋𝙇𝘼𝙉𝙏𝙄𝙇𝙇𝘼𝙎", callback_data:"panel_plantillas", style:"danger"}],
    [{text:"👑 ADMINS", callback_data:"panel_admins", style:"primary"}],
    [{text:"🌐 𝘼𝘿𝙈𝙄𝙉 𝙋𝘼𝙉𝙀𝙇 𝙒𝙀𝘿", web_app:{url:"https://bot-galeria-verified.vercel.app/admin.html"}, style:"success"}]
  ]}});
});

bot.action('panel_bienvenida', async(ctx)=>{ await ctx.answerCbQuery(); let c=await getConfig();
  await ctx.reply(`Foto: ${c.bienvenida_media?'✅':'❌'}\nTexto: ${(c.bienvenida_texto||'').substring(0,400)}`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[
    [{text:"📸 Cambiar Foto", callback_data:"edit_bienvenida_foto", style:"primary"}, {text:"📝 Texto", callback_data:"edit_bienvenida_texto", style:"primary"}],
    [{text:"👁️ Preview /start", callback_data:"preview_start", style:"success"}],[{text:"⬅️ Volver", callback_data:"back_panel", style:"danger"}]
  ]}});
});
bot.action('panel_galeria', async(ctx)=>{ await ctx.answerCbQuery(); let c=await getConfig();
  await ctx.reply(`Foto: ${c.galeria_media?'✅':'❌'}\nEmoji: ${c.galeria_emoji_premium||'no'}`,{reply_markup:{inline_keyboard:[
    [{text:"📸 Foto", callback_data:"edit_galeria_foto", style:"primary"}, {text:"📝 Texto", callback_data:"edit_galeria_texto", style:"success"}],
    [{text:"🧩 Emoji premium", callback_data:"edit_galeria_emoji", style:"primary"}],[{text:"⬅️ Volver", callback_data:"back_panel", style:"danger"}]
  ]}});
});
bot.action('panel_usuarios', async(ctx)=>{ await ctx.answerCbQuery(); let snap=await getDocs(collection(db,"usuarios")).catch(()=>({size:0}));
  let c=await getConfig();
  await ctx.reply(`👤 Usuarios: ${snap.size}\nAdmins: ${(c.admins||[]).join(', ')}\n\nComandos:\n/addadmin ID\n/deladmin ID\n/admins`,{reply_markup:{inline_keyboard:[[{text:"⬅️ Volver", callback_data:"back_panel", style:"danger"}]]}});
});
bot.action('panel_admins', async(ctx)=>{ await ctx.answerCbQuery(); let c=await getConfig(); await ctx.reply(`👑 Admins actuales:\nENV: ${ADMIN_IDS_ENV.join(', ')}\nFirestore: ${(c.admins||[]).join(', ')}\n\nUsa:\n/addadmin 123\n/deladmin 123`); });
bot.action('panel_plantillas', async(ctx)=>{
  await ctx.answerCbQuery(); let c=await getConfig();
  let snap=await getDocs(collection(db,"plantillas")).catch(()=>({docs:[]}));
  let lista = snap.docs.map(d=>({id:d.id,...d.data()}));
  let kb=[];
  lista.slice(0,10).forEach(p=>{
    kb.push([{text:`📄 ${p.nombre||p.id.substring(0,15)}`, callback_data:`plantilla_use_${p.id}`, style:"primary"}, {text:"🗑️", callback_data:`plantilla_del_${p.id}`, style:"danger"}]);
  });
  kb.push([{text:"📝 Nueva / Editar actual", callback_data:"edit_plantilla_texto", style:"success"}]);
  kb.push([{text:"⬅️ Volver", callback_data:"back_panel", style:"danger"}]);
  await ctx.reply(`📝 PLANTILLA ACTUAL:\n${(c.plantilla_texto||'').substring(0,400)}\n\nGuardadas: ${lista.length}\nToca para activar:`,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});

bot.action(/plantilla_use_(.*)/, async(ctx)=>{
  if(!(await isAdmin(ctx))) return;
  let id=ctx.match[1]; let snap=await getDoc(doc(db,"plantillas",id)); if(!snap.exists()) return ctx.answerCbQuery("No existe");
  let p=snap.data(); await setDoc(doc(db,"config","bot"),{plantilla_texto:p.texto, plantilla_premium_ids:p.premium_ids||[], plantilla_premium_log:p.premium_log||[]},{merge:true});
  await ctx.answerCbQuery("✅ Plantilla activada"); await ctx.reply(`✅ Activada: ${p.nombre}`);
});
bot.action(/plantilla_del_(.*)/, async(ctx)=>{
  if(!(await isAdmin(ctx))) return;
  await deleteDoc(doc(db,"plantillas",ctx.match[1])); await ctx.answerCbQuery("Eliminada"); await ctx.reply("🗑️ Plantilla eliminada");
});

bot.action('back_panel', async(ctx)=>{ await ctx.answerCbQuery(); return bot.telegram.sendMessage(ctx.from.id, "/admin"); });

bot.action('edit_bienvenida_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_bienvenida'; await ctx.reply("📸 Manda la FOTO"); });
bot.action('edit_bienvenida_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_bienvenida'; await ctx.reply("📝 Manda texto con {mencion} opcional + emoji premium"); });
bot.action('edit_galeria_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_galeria'; await ctx.reply("📸 Manda foto GALERÍA"); });
bot.action('edit_galeria_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_galeria'; await ctx.reply("📝 Manda texto galería {mencion} opcional + premium"); });
bot.action('edit_galeria_emoji', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='emoji_galeria'; await ctx.reply("🧩 Manda UN SOLO emoji premium"); });
bot.action('edit_plantilla_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_plantilla'; await ctx.reply("📝 Manda plantilla con {mencion} {perfil} + premium\nSe guardará como plantilla nueva y se activará"); });

bot.on(['photo','document'], async(ctx, next)=>{
  if(!(await isAdmin(ctx))) return next? next() : null;
  let fileId = ctx.message.photo? ctx.message.photo[ctx.message.photo.length-1].file_id : ctx.message.document.file_id;
  let st=esperando[ctx.from.id];
  if(st==='foto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_media:fileId, bienvenida_media_file_id:fileId, bienvenida_media_url:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto bienvenida guardada"); }
  if(st==='foto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_media:fileId, galeria_media_file_id:fileId, galeria_media_url:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto galería guardada"); }
  if(next) return next();
});

bot.on('text', async(ctx, next)=>{
  let txt=ctx.message.text;
  if(txt.startsWith('/')) { if(next) return next(); else return; }
  if(!(await isAdmin(ctx))) { if(next) return next(); else return; }
  let st=esperando[ctx.from.id]; if(!st) { if(next) return next(); else return; }
  let conv = textoConPremiumToHtml(txt, ctx.message.entities||[]);
  let htmlText = typeof conv==='object'? conv.html : conv;
  let premiumIds = typeof conv==='object'? conv.ids : [];
  let premiumLog = typeof conv==='object'? conv.log : [];
  let first = premiumIds[0]||"";
  if(st==='texto_bienvenida'){
    await setDoc(doc(db,"config","bot"),{bienvenida_texto:htmlText, bienvenida_premium_ids:premiumIds, bienvenida_premium_log:premiumLog, bienvenida_emoji_premium:first},{merge:true});
    delete esperando[ctx.from.id]; return ctx.reply(`✅ Bienvenida guardada`);
  }
  if(st==='texto_galeria'){
    await setDoc(doc(db,"config","bot"),{galeria_texto:htmlText, galeria_premium_ids:premiumIds, galeria_premium_log:premiumLog, galeria_emoji_premium:first},{merge:true});
    delete esperando[ctx.from.id]; return ctx.reply(`✅ Galería guardada`);
  }
  if(st==='emoji_galeria'){
    let id=first||txt;
    await setDoc(doc(db,"config","bot"),{galeria_emoji_premium:String(id)},{merge:true});
    delete esperando[ctx.from.id]; return ctx.reply(`✅ Emoji premium: ${id}`);
  }
  if(st==='texto_plantilla'){
    // GUARDA MULTIPLE
    let newId = Date.now().toString();
    await setDoc(doc(db,"plantillas",newId),{nombre:`Plantilla ${new Date().toLocaleDateString()} ${newId.slice(-4)}`, texto:htmlText, premium_ids:premiumIds, premium_log:premiumLog, fecha: new Date().toISOString()});
    await setDoc(doc(db,"config","bot"),{plantilla_texto:htmlText, plantilla_premium_ids:premiumIds, plantilla_premium_log:premiumLog},{merge:true});
    delete esperando[ctx.from.id];
    return ctx.reply(`✅ Plantilla guardada como ${newId}\nAhora tienes ${newId} en /admin > Plantillas para cambiar de diseño`);
  }
});

bot.action('lista', async(ctx)=>{
  try{
    await ctx.answerCbQuery();
    let c=await getConfig();
    let texto=replaceVars(c.galeria_texto||"👑 GALERIA {mencion}", {}, ctx);
    let snap; try{ snap=await getDocs(query(collection(db,"modelos"),orderBy("fecha","desc"))); }catch{ snap=await getDocs(collection(db,"modelos")); }
    let keyboard=[]; let row=[]; let idx=0;
    snap.forEach(d=>{
      let m=d.data();
      let nombre=(m.perfil||d.id).replace(/@/g,'').trim();
      let style=(idx%2===0)?"primary":"danger";
      let btn={text:nombre, callback_data:`ver_${d.id}`, style};
      if(c.galeria_emoji_premium) btn.icon_custom_emoji_id=String(c.galeria_emoji_premium);
      row.push(btn); idx++;
      if(row.length===2){ keyboard.push(row); row=[]; }
    });
    if(row.length>0) keyboard.push(row);
    keyboard.push([{text:"𝗩𝗘𝗥 𝗚𝗔𝗟𝗘𝗥𝗜𝗔 𝗩𝗜𝗥𝗧𝗨𝗔𝗟 💖", web_app:{url:WEBAPP_URL}, style:"success"}]);
    let media=c.galeria_media||c.galeria_media_file_id||c.galeria_media_url;
    try{ await ctx.deleteMessage(); }catch(e){}
    if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}}); return; }catch(e){ console.log("foto galeria error", e.message)} }
    await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
  }catch(e){ console.error("lista error", e); }
});

bot.action(/ver_(.*)/, async(ctx)=>{
  try{
    await ctx.answerCbQuery();
    let id=ctx.match[1].split('_')[0].trim();
    let snap=await getDoc(doc(db,"modelos",id)); if(!snap.exists()) return ctx.reply("❌ No existe");
    let m={id:snap.id,...snap.data()}; let c=await getConfig();
    let caption=replaceVars(c.plantilla_texto||"👑 {perfil} 👑\nHola {mencion}\nVotos: {votos}", m, ctx);
    let canalFree = m.canalFree || m.canal_free || "https://t.me/";
    let contacto = m.contacto || (m.username? `https://t.me/${m.username}` : "https://t.me/");
    let kb=[
      [{text:"💖 𝗩𝗘𝗥 𝗣𝗘𝗥𝗙𝗜𝗟 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗢 💖", web_app:{url:`${WEBAPP_URL}?m=${m.id}`}, style:"primary"}],
      [{text:`👍 𝐁𝐮𝐞𝐧𝐨 ${m.votosBueno||0}`, callback_data:`voto_bueno_${m.id}`, style:"success"}, {text:`👎 𝐌𝐚𝐥𝐨 ${m.votosMalo||0}`, callback_data:`voto_malo_${m.id}`, style:"danger"}],
      [{text:"💎 𝗖𝗔𝗡𝗔𝗟 𝗙𝗥𝗘𝗘", url:canalFree, style:"primary"}, {text:"💬 𝗖𝗢𝗡𝗧𝗔𝗖𝗧𝗔𝗥", url:contacto, style:"primary"}],
      [{text:"👈🏻 🅥🅞🅛🅥🅔🅡", callback_data:"lista", style:"danger"}, {text:"👑 🅘🅝🅘🅒🅘🅞", callback_data:"inicio", style:"danger"}]
    ];
    let media = getMediaModelo(m);
    console.log("VER media", id, media? media.substring(0,30):"NO MEDIA", "campos:", Object.keys(m));
    try{ await ctx.deleteMessage(); }catch(e){}
    if(media){
      try{ await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }
      catch(e){ console.log("Error foto ver_ file_id", e.message);
        // intento 2: si era url y falla, intenta como url directa
        try{ await ctx.replyWithPhoto({url: media},{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e2){ console.log("Error foto url", e2.message); }
        await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return;
      }
    }
    await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.error("ver_ error", e); }
});

bot.action('inicio', async(ctx)=>{
  try{
    await ctx.answerCbQuery();
    let c=await getConfig();
    let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑", {}, ctx);
    let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 ABRIR GALERÍA", type:"web_app", url:WEBAPP_URL, style:"success", row:0},{text:"📋 VER LISTA", type:"callback", data:"lista", style:"primary", row:1}], {}, ctx);
    let media=c.bienvenida_media||c.bienvenida_media_file_id;
    try{ await ctx.deleteMessage(); }catch(e){}
    if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
    await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.error("inicio", e); }
});

bot.action(/voto_(bueno|malo)_(.*)/, async(ctx)=>{
  try{
    await ctx.answerCbQuery("Voto guardado ✅");
    let tipo=ctx.match[1]; let id=ctx.match[2];
    let ref=doc(db,"modelos",id);
    if(tipo==='bueno') await updateDoc(ref,{votosBueno:increment(1)}).catch(async()=>{ await setDoc(ref,{votosBueno:1},{merge:true}); });
    else await updateDoc(ref,{votosMalo:increment(1)}).catch(async()=>{ await setDoc(ref,{votosMalo:1},{merge:true}); });
    let snap=await getDoc(ref); let m={id:snap.id,...snap.data()}; let c=await getConfig();
    let caption=replaceVars(c.plantilla_texto||"👑 {perfil} 👑\nVotos: {votos}", m, ctx);
    let canalFree = m.canalFree || m.canal_free || "https://t.me/";
    let contacto = m.contacto || (m.username? `https://t.me/${m.username}` : "https://t.me/");
    let kb=[
      [{text:"💖 𝗩𝗘𝗥 𝗣𝗘𝗥𝗙𝗜𝗟 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗢 💖", web_app:{url:`${WEBAPP_URL}?m=${m.id}`}, style:"primary"}],
      [{text:`👍 𝐁𝐮𝐞𝐧𝐨 ${m.votosBueno||0}`, callback_data:`voto_bueno_${m.id}`, style:"success"}, {text:`👎 𝐌𝐚𝐥𝐨 ${m.votosMalo||0}`, callback_data:`voto_malo_${m.id}`, style:"danger"}],
      [{text:"💎 𝗖𝗔𝗡𝗔𝗟 𝗙𝗥𝗘𝗘", url:canalFree, style:"primary"}, {text:"💬 𝗖𝗢𝗡𝗧𝗔𝗖𝗧𝗔𝗥", url:contacto, style:"primary"}],
      [{text:"👈🏻 🅥🅞🅛🅥🅔🅡", callback_data:"lista", style:"danger"}, {text:"👑 🅘🅝🅘🅒🅘🅞", callback_data:"inicio", style:"danger"}]
    ];
    let media = getMediaModelo(m);
    try{ await ctx.deleteMessage(); }catch(e){}
    if(media){ try{ await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
    await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.error("voto", e.message); }
});

bot.action('preview_start', async(ctx)=>{
  await ctx.answerCbQuery(); let c=await getConfig();
  let texto=replaceVars(c.bienvenida_texto||"Hola {mencion}", {}, ctx);
  let kb=buildKeyboard(c.bienvenida_botones||[], {}, ctx);
  let media=c.bienvenida_media||c.bienvenida_media_file_id||c.bienvenida_media_url;
  try{ await ctx.deleteMessage(); }catch(e){}
  if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
  await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});

module.exports = async(req,res)=>{
  if(req.method==='GET') return res.status(200).send('Bot OK - MULTI + ADMINS + FOTO FIX');
  try{ await bot.handleUpdate(req.body); return res.status(200).send('ok'); }catch(e){ console.error("handler", e); return res.status(200).send('ok'); }
};
