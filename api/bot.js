const { Telegraf } = require('telegraf');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy } = require('firebase/firestore');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = "https://galeria-verifiedmodels.vercel.app";
const ADMIN_IDS = (process.env.ADMIN_IDS || "").split(",").map(s=>s.trim()).filter(Boolean);
const fbApp = initializeApp({ apiKey:"AIzaSyAIHevrpglvhHK3IsxpnkHlWpxnuf5o1So",authDomain:"galeria-verifiedmodels.firebaseapp.com",projectId:"galeria-verifiedmodels",storageBucket:"galeria-verifiedmodels.firebasestorage.app",messagingSenderId:"684551560793",appId:"1:684551560793:web:3730a07d8d6ec737e3db48"});
const db=getFirestore(fbApp);
const bot = new Telegraf(BOT_TOKEN);
function isAdmin(ctx){ return ADMIN_IDS.length===0 || ADMIN_IDS.includes(String(ctx.from.id)); }
async function getConfig(){ try{ let s=await getDoc(doc(db,"config","bot")); if(s.exists()) return s.data(); }catch(e){} return {}; }
function getMencion(ctx){
  if(!ctx ||!ctx.from) return "👋";
  let name = (ctx.from.first_name || "amig@").replace(/</g,'').replace(/>/g,'');
  let id = ctx.from.id;
  return `<a href="tg://user?id=${id}">${name}</a>`;
}
function replaceVars(str, m={}, ctx=null){
  if(!str) return "";
  let total=(m.votosMalo||0)+(m.votosBueno||0);
  let pBueno=total?Math.round((m.votosBueno||0)/total*100):0;
  let lista=m.servicios?.map(s=>`• ${s}`).join('\n')||'• -';
  let mencion = ctx? getMencion(ctx) : "{mencion}";
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
let esperando={};

// >>> FIX: /start SIEMPRE PRIMERO <<<
bot.start(async(ctx)=>{
  console.log("START RECIBIDO", ctx.from.id);
  let c=await getConfig();
  let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑\nBienvenid@ a Galeria", {}, ctx);
  let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 ABRIR GALERÍA", type:"web_app", url:WEBAPP_URL, style:"success", row:0}], {}, ctx);
  let media = c.bienvenida_media || c.bienvenida_media_file_id || c.bienvenida_media_url;
  if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){ console.log("Error foto bienvenida:", e.message)} }
  await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});

bot.command('admin', async(ctx)=>{
  if(!isAdmin(ctx)) return ctx.reply("❌ No eres admin");
  await ctx.reply(`👑 <b>PANEL DE ADMIN</b> 👑\n\n👋 BIENVENID@ AL PANEL DE CONTROL\nAQUI PODRAS MANEJAR EL DISEÑO Y FUNCIONES DEL BOT.\n\n⬇️ QUE DECEAS REALIAZAR ⬇️`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[
    [{text:"👋🏻 𝗕𝗜𝗘𝗡𝗩𝗘𝗡𝗜𝗗𝗔", callback_data:"panel_bienvenida", style:"success"}, {text:"🖼️ 𝗚𝗔𝗟𝗘𝗥𝗜𝗔", callback_data:"panel_galeria", style:"primary"}],
    [{text:"👤 𝗨𝗦𝗨𝗔𝗥𝗜𝗢𝗦", callback_data:"panel_usuarios", style:"primary"}, {text:"💾 𝗣𝗟𝗔𝗡𝗧𝗜𝗟𝗟𝗔𝗦", callback_data:"panel_plantillas", style:"danger"}],
    [{text:"🌐 𝗔𝗗𝗠𝗜𝗡 𝗣𝗔𝗡𝗘𝗟 𝗪𝗘𝗗 🖥️", web_app:{url:"https://bot-galeria-verified.vercel.app/admin.html"}, style:"primary"}]
  ]}});
});

bot.action('panel_bienvenida', async(ctx)=>{ await ctx.answerCbQuery(); let c=await getConfig();
  await ctx.reply(`🟢 <b>BOTON DE BIENVENIDA</b>\nFoto: ${c.bienvenida_media||c.bienvenida_media_file_id||c.bienvenida_media_url?'✅':'❌'}\nTexto: ${(c.bienvenida_texto||'').substring(0,500)}\n\nVariable: {mencion} OPCIONAL - ponla donde quieras`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[
    [{text:"📸 Cambiar Foto", callback_data:"edit_bienvenida_foto", style:"primary"}, {text:"📝 Texto {mencion}", callback_data:"edit_bienvenida_texto", style:"success"}],
    [{text:"👁️ Preview /start", callback_data:"preview_start", style:""}],[{text:"⬅️ Volver", callback_data:"back_panel", style:"danger"}]
  ]}});
});
bot.action('panel_galeria', async(ctx)=>{ await ctx.answerCbQuery(); let c=await getConfig();
  await ctx.reply(`🔵 <b>GALERÍA</b>\nFoto: ${c.galeria_media||c.galeria_media_file_id||c.galeria_media_url?'✅':'❌'}\nEmoji premium: ${c.galeria_emoji_premium||'no'}`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[
    [{text:"📸 Cambiar Foto", callback_data:"edit_galeria_foto", style:"primary"}, {text:"📝 Texto {mencion}", callback_data:"edit_galeria_texto", style:"success"}],
    [{text:"🧩 Emoji premium", callback_data:"edit_galeria_emoji", style:"primary"}],[{text:"⬅️ Volver", callback_data:"back_panel", style:"danger"}]
  ]}});
});
bot.action('panel_usuarios', async(ctx)=>{ await ctx.answerCbQuery(); let snap=await getDocs(collection(db,"usuarios")).catch(()=>({size:0})); await ctx.reply(`🔵 USUARIOS\nTotal: ${snap.size}`,{reply_markup:{inline_keyboard:[[{text:"⬅️ Volver", callback_data:"back_panel", style:"danger"}]]}}); });
bot.action('panel_plantillas', async(ctx)=>{ await ctx.answerCbQuery(); let c=await getConfig(); await ctx.reply(`🔴 PLANTILLAS\n${(c.plantilla_texto||'').substring(0,500)}\n\nVars: {mencion} {perfil}`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"📝 Editar {mencion}", callback_data:"edit_plantilla_texto", style:"danger"}],[{text:"⬅️ Volver", callback_data:"back_panel", style:"danger"}]]}}); });
bot.action('back_panel', async(ctx)=>{ await ctx.answerCbQuery(); return bot.telegram.sendMessage(ctx.from.id, "/admin"); });

bot.action('edit_bienvenida_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_bienvenida'; await ctx.reply("📸 Manda la FOTO"); });
bot.action('edit_bienvenida_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_bienvenida'; await ctx.reply("📝 Manda texto con {mencion} si quieres mención. Ej: Hola {mencion} bienvenid@ 👑 - Si no pones {mencion}, no sale nada."); });
bot.action('edit_galeria_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_galeria'; await ctx.reply("📸 Manda foto GALERÍA"); });
bot.action('edit_galeria_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_galeria'; await ctx.reply("📝 Manda texto galería con {mencion} opcional"); });
bot.action('edit_galeria_emoji', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='emoji_galeria'; await ctx.reply("🧩 Manda UN SOLO emoji premium"); });
bot.action('edit_plantilla_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_plantilla'; await ctx.reply("📝 Manda plantilla con {mencion} {perfil} etc - {mencion} es OPCIONAL"); });

bot.on(['photo','document'], async(ctx, next)=>{
  if(!isAdmin(ctx)) return next? next() : null;
  let fileId = ctx.message.photo? ctx.message.photo[ctx.message.photo.length-1].file_id : ctx.message.document.file_id;
  let st=esperando[ctx.from.id];
  if(st==='foto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_media:fileId, bienvenida_media_file_id:fileId, bienvenida_media_url:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto bienvenida guardada"); }
  if(st==='foto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_media:fileId, galeria_media_file_id:fileId, galeria_media_url:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto galería guardada"); }
  if(next) return next();
});

bot.on('text', async(ctx, next)=>{
  let txt=ctx.message.text;
  if(txt.startsWith('/')) { if(next) return next(); else return; }
  if(!isAdmin(ctx)) { if(next) return next(); else return; }
  let st=esperando[ctx.from.id]; if(!st) { if(next) return next(); else return; }
  let ent=ctx.message.entities||[];
  let premiumIds = ent.filter(e=>e.type==='custom_emoji').map(e=>e.custom_emoji_id);
  if(st==='texto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_texto:txt},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Texto con {mencion} OPCIONAL guardado${premiumIds.length?`\n✨ Premium detectado: ${premiumIds[0]}`:''}`); }
  if(st==='texto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_texto:txt},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Texto galería guardado${premiumIds.length?`\n✨ Premium: ${premiumIds[0]}`:''}`); }
  if(st==='emoji_galeria'){ let id=txt; for(let e of ent){ if(e.type==='custom_emoji') id=e.custom_emoji_id; } await setDoc(doc(db,"config","bot"),{galeria_emoji_premium:id},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Emoji premium guardado: ${id}`); }
  if(st==='texto_plantilla'){ await setDoc(doc(db,"config","bot"),{plantilla_texto:txt},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Plantilla con {mencion} guardada${premiumIds.length?`\n✨ Premium detectado: ${premiumIds[0]}`:''}`); }
});

// === REEMPLAZADAS - VER LISTA SOBRE MISMO MENSAJE ===
bot.action('lista', async(ctx)=>{
  try{
    await ctx.answerCbQuery();
    let c=await getConfig();
    let texto=replaceVars(c.galeria_texto||"👑 GALERIA {mencion}\nElige una chica 👇", {}, ctx);
    let snap=await getDocs(query(collection(db,"modelos"),orderBy("fecha","desc")));
    let keyboard=[]; let row=[];
    snap.forEach(d=>{
      let m=d.data();
      row.push({text: `${m.perfil}`, callback_data:`ver_${d.id}`}); // SOLO NOMBRE
      if(row.length===2){ keyboard.push(row); row=[]; }
    });
    if(row.length>0) keyboard.push(row);
    keyboard.push([{text:"💖 ABRIR GALERÍA WEB", web_app:{url:WEBAPP_URL}}]);
    keyboard.push([{text:"🏠 Inicio", callback_data:"inicio"}]);
    try{
      await ctx.editMessageCaption(texto, {parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
    }catch(e){
      try{
        await ctx.editMessageText(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
      }catch(e2){
        let media = c.galeria_media || c.galeria_media_file_id;
        if(media){
          try{ await ctx.deleteMessage(); }catch(e){}
          await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
        }else{
          await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
        }
      }
    }
  }catch(e){ console.error("lista error", e); await ctx.answerCbQuery("Error, intenta de nuevo").catch(()=>{}); }
});

bot.action('inicio', async(ctx)=>{
  try{
    await ctx.answerCbQuery();
    let c=await getConfig();
    let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑\nBienvenid@ a Galeria", {}, ctx);
    let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 𝘼𝘽𝙍𝙄𝙍 𝙂𝘼𝙇𝙀𝙍𝙄𝘼 𝙑𝙄𝙍𝙏𝙐𝘼𝙇 💖", type:"web_app", url:WEBAPP_URL, row:0},{text:"📋 VER LISTA", type:"callback", data:"lista", row:1}], {}, ctx);
    let media = c.bienvenida_media || c.bienvenida_media_file_id;
    try{
      if(media){
        await ctx.editMessageMedia({type:'photo', media:media, caption:texto, parse_mode:'HTML'}, {reply_markup:{inline_keyboard:kb}});
      }else{
        await ctx.editMessageText(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
      }
    }catch(e){
      try{ await ctx.editMessageCaption(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); }catch(e2){
        try{ await ctx.deleteMessage(); }catch(e){}
        if(media) await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
        else await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
      }
    }
  }catch(e){ console.error("inicio error", e); }
});

bot.action(/ver_(.*)/, async(ctx)=>{
  try{
    await ctx.answerCbQuery();
    let snap=await getDoc(doc(db,"modelos",ctx.match[1])); if(!snap.exists()) return;
    let m={id:snap.id,...snap.data()}; let c=await getConfig();
    let caption=replaceVars(c.plantilla_texto||"👑 {perfil} 👑\nHola {mencion}", m, ctx);
    let kb=buildKeyboard(c.plantilla_botones||[{text:"💖 VER PERFIL", type:"web_app", url:WEBAPP_URL+"?m={id}", row:0}], m, ctx);
    kb.push([{text:"⬅️ Volver", callback_data:"lista"}, {text:"🏠 Inicio", callback_data:"inicio"}]);
    let media = m.foto || m.foto_url;
    try{
      await ctx.editMessageMedia({type:'photo', media:media, caption:caption, parse_mode:'HTML'}, {reply_markup:{inline_keyboard:kb}});
    }catch(e){
      try{ await ctx.editMessageCaption(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); }catch(e2){
        try{ await ctx.deleteMessage(); }catch(e){}
        try{ await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); }catch(e){ await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); }
      }
    }
  }catch(e){ console.error("ver_ error", e); }
});

bot.action('preview_start', async(ctx)=>{
  await ctx.answerCbQuery(); let c=await getConfig();
  let texto=replaceVars(c.bienvenida_texto||"Hola {mencion}", {}, ctx);
  let kb=buildKeyboard(c.bienvenida_botones||[], {}, ctx);
  let media = c.bienvenida_media || c.bienvenida_media_file_id || c.bienvenida_media_url;
  if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
  await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});

module.exports = async(req,res)=>{
  if(req.method==='GET') return res.status(200).send('Bot OK - MISMO MENSAJE + solo nombre + FIX START');
  try{ await bot.handleUpdate(req.body); return res.status(200).send('ok'); }catch(e){ console.error(e); return res.status(200).send('ok'); }
};
