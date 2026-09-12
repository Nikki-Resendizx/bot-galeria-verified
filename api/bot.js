const { Telegraf } = require('telegraf');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, increment, updateDoc } = require('firebase/firestore');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = "https://galeria-verifiedmodels.vercel.app";
const ADMIN_IDS = (process.env.ADMIN_IDS || "").split(",").map(s=>s.trim()).filter(Boolean);
const fbApp = initializeApp({ apiKey:"AIzaSyAIHevrpglvhHK3IsxpnkHlWpxnuf5o1So",authDomain:"galeria-verifiedmodels.firebaseapp.com",projectId:"galeria-verifiedmodels",storageBucket:"galeria-verifiedmodels.firebasestorage.app",messagingSenderId:"684551560793",appId:"1:684551560793:web:3730a07d8d6ec737e3db48"});
const db=getFirestore(fbApp);
const bot = new Telegraf(BOT_TOKEN);

function isAdmin(ctx){ return ADMIN_IDS.length===0 || ADMIN_IDS.includes(String(ctx.from.id)); }
async function getConfig(){ try{ let s=await getDoc(doc(db,"config","bot")); if(s.exists()) return s.data(); }catch(e){} return {}; }

// {mencion} SOLO VARIABLE OPCIONAL
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

// Helper para reenviar premium con <tg-emoji>
function aplicarPremium(texto, premiumLog){
  if(!premiumLog ||!premiumLog.length) return texto;
  let result = texto;
  // reemplaza de atrás hacia adelante para no romper offset
  [...premiumLog].sort((a,b)=>b.offset-a.offset).forEach(p=>{
    let before = result.substring(0, p.offset);
    let after = result.substring(p.offset + p.length);
    result = before + `<tg-emoji emoji-id="${p.id}">${p.base}</tg-emoji>` + after;
  });
  return result;
}

let esperando={};

bot.start(async(ctx)=>{
  let c=await getConfig();
  let textoBase = c.bienvenida_texto||"Hola {mencion} 👑\nBienvenid@ a Galeria";
  let texto = aplicarPremium(replaceVars(textoBase, {}, ctx), c.bienvenida_premium_log);
  let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 ABRIR GALERÍA", type:"web_app", url:WEBAPP_URL, style:"success", row:0},{text:"📋 VER LISTA", type:"callback", data:"lista", style:"primary", row:1}], {}, ctx);
  let media = c.bienvenida_media || c.bienvenida_media_file_id || c.bienvenida_media_url;
  if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
  await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});

bot.command('admin', async(ctx)=>{
  if(!isAdmin(ctx)) return ctx.reply("❌ No eres admin");
  await ctx.reply(`👑 <b>PANEL DE ADMIN</b>`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[
    [{text:"👋🏻 BIENVENIDA", callback_data:"panel_bienvenida", style:"primary"}, {text:"🖼️ GALERIA", callback_data:"panel_galeria", style:"primary"}],
    [{text:"👤 USUARIOS", callback_data:"panel_usuarios", style:"danger"}, {text:"📝 PLANTILLAS", callback_data:"panel_plantillas", style:"danger"}],
    [{text:"🌐 ADMIN PANEL", web_app:{url:"https://bot-galeria-verified.vercel.app/admin.html"}, style:"success"}]
  ]}});
});

bot.action('panel_bienvenida', async(ctx)=>{ await ctx.answerCbQuery(); let c=await getConfig();
  await ctx.reply(`Foto: ${c.bienvenida_media?'✅':'❌'}\nTexto: ${(c.bienvenida_texto||'').substring(0,400)}\n\n{mencion} opcional`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[
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
bot.action('panel_usuarios', async(ctx)=>{ await ctx.answerCbQuery(); let snap=await getDocs(collection(db,"usuarios")).catch(()=>({size:0})); await ctx.reply(`Usuarios: ${snap.size}`); });
bot.action('panel_plantillas', async(ctx)=>{ await ctx.answerCbQuery(); let c=await getConfig(); await ctx.reply(`Plantilla:\n${(c.plantilla_texto||'').substring(0,500)}\n\n{mencion} opcional`,{reply_markup:{inline_keyboard:[[{text:"📝 Editar", callback_data:"edit_plantilla_texto", style:"danger"}],[{text:"⬅️ Volver", callback_data:"back_panel", style:"danger"}]]}}); });
bot.action('back_panel', async(ctx)=>{ await ctx.answerCbQuery(); return bot.telegram.sendMessage(ctx.from.id, "/admin"); });

bot.action('edit_bienvenida_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_bienvenida'; await ctx.reply("📸 Manda la FOTO"); });
bot.action('edit_bienvenida_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_bienvenida'; await ctx.reply("📝 Manda texto con {mencion} opcional + emojis premium"); });
bot.action('edit_galeria_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_galeria'; await ctx.reply("📸 Manda foto GALERÍA"); });
bot.action('edit_galeria_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_galeria'; await ctx.reply("📝 Manda texto galería {mencion} opcional + premium"); });
bot.action('edit_galeria_emoji', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='emoji_galeria'; await ctx.reply("🧩 Manda UN SOLO emoji premium"); });
bot.action('edit_plantilla_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_plantilla'; await ctx.reply("📝 Manda plantilla con {mencion} {perfil} opcional + premium"); });

bot.on(['photo','document'], async(ctx, next)=>{
  if(!isAdmin(ctx)) return next? next() : null;
  let fileId = ctx.message.photo? ctx.message.photo[ctx.message.photo.length-1].file_id : ctx.message.document.file_id;
  let st=esperando[ctx.from.id];
  if(st==='foto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_media:fileId, bienvenida_media_file_id:fileId, bienvenida_media_url:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto bienvenida guardada"); }
  if(st==='foto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_media:fileId, galeria_media_file_id:fileId, galeria_media_url:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto galería guardada"); }
  if(next) return next();
});

// TU CODIGO PREMIUM INTEGRADO
bot.on('text', async(ctx, next)=>{
  let txt=ctx.message.text;
  if(txt.startsWith('/')) { if(next) return next(); else return; }
  if(!isAdmin(ctx)) { if(next) return next(); else return; }
  let st=esperando[ctx.from.id]; if(!st) { if(next) return next(); else return; }

  if (ctx.message.text && ctx.message.entities) {
    let premiumLog=[];
    for (const entity of ctx.message.entities) {
      if (entity.type === 'custom_emoji') {
        const emojiId = entity.custom_emoji_id;
        const emojiPlano = txt.substring(entity.offset, entity.offset + entity.length);
        console.log(`¡Emoji Premium detectado! ID: ${emojiId} Base: ${emojiPlano}`);
        premiumLog.push({id:emojiId, base:emojiPlano, offset:entity.offset, length:entity.length});
      }
    }
    let premiumIds = premiumLog.map(p=>p.id);
    let first = premiumIds[0] || "";

    if(st==='texto_bienvenida'){
      await setDoc(doc(db,"config","bot"),{bienvenida_texto:txt, bienvenida_premium_ids:premiumIds, bienvenida_premium_log:premiumLog, bienvenida_emoji_premium:first},{merge:true});
      delete esperando[ctx.from.id];
      if(first){
        await ctx.reply(`He leído tu emoji premium. ID: ${first}\nAquí tienes tu emoji de vuelta: <tg-emoji emoji-id="${first}">${premiumLog[0].base}</tg-emoji>`,{parse_mode:'HTML'});
      }
      return ctx.reply(`✅ Bienvenida guardada - {mencion} opcional + ${premiumIds.length} premium`);
    }
    if(st==='texto_galeria'){
      await setDoc(doc(db,"config","bot"),{galeria_texto:txt, galeria_premium_ids:premiumIds, galeria_premium_log:premiumLog, galeria_emoji_premium:first},{merge:true});
      delete esperando[ctx.from.id];
      return ctx.reply(`✅ Galería guardada${first?` Premium: ${first}`:''}`);
    }
    if(st==='emoji_galeria'){
      let id=first || txt;
      let base = premiumLog[0]?.base || "😎";
      await setDoc(doc(db,"config","bot"),{galeria_emoji_premium:String(id)},{merge:true});
      delete esperando[ctx.from.id];
      if(first) return ctx.reply(`✅ Emoji premium guardado: <tg-emoji emoji-id="${id}">${base}</tg-emoji>`,{parse_mode:'HTML'});
      return ctx.reply(`✅ Emoji guardado: ${id}`);
    }
    if(st==='texto_plantilla'){
      await setDoc(doc(db,"config","bot"),{plantilla_texto:txt, plantilla_premium_ids:premiumIds, plantilla_premium_log:premiumLog, plantilla_emoji_premium:first},{merge:true});
      delete esperando[ctx.from.id];
      if(first) await ctx.reply(`Plantilla con premium: <tg-emoji emoji-id="${first}">${premiumLog[0].base}</tg-emoji>`,{parse_mode:'HTML'});
      return ctx.reply(`✅ Plantilla guardada - {mencion} opcional + ${premiumIds.length} premium`);
    }
  }else{
    // sin entities pero igual guarda
    if(st==='texto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_texto:txt},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Bienvenida guardada"); }
    if(st==='texto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_texto:txt},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Galería guardada"); }
    if(st==='texto_plantilla'){ await setDoc(doc(db,"config","bot"),{plantilla_texto:txt},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Plantilla guardada"); }
  }
});

bot.action('lista', async(ctx)=>{
  try{
    await ctx.answerCbQuery();
    let c=await getConfig();
    let textoBase=c.galeria_texto||"👑 GALERIA {mencion}";
    let texto=aplicarPremium(replaceVars(textoBase, {}, ctx), c.galeria_premium_log || c.galeria_texto_premium_log);
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
    keyboard.push([{text:"💖 ABRIR GALERÍA WEB", web_app:{url:WEBAPP_URL}, style:"success"}]);
    let media=c.galeria_media||c.galeria_media_file_id||c.galeria_media_url;
    try{ await ctx.deleteMessage(); }catch(e){}
    if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}}); return; }catch(e){} }
    await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
  }catch(e){ console.error("lista", e); }
});

bot.action('inicio', async(ctx)=>{
  try{
    await ctx.answerCbQuery();
    let c=await getConfig();
    let textoBase=c.bienvenida_texto||"Hola {mencion} 👑";
    let texto=aplicarPremium(replaceVars(textoBase, {}, ctx), c.bienvenida_premium_log);
    let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 ABRIR GALERÍA", type:"web_app", url:WEBAPP_URL, style:"success", row:0},{text:"📋 VER LISTA", type:"callback", data:"lista", style:"primary", row:1}], {}, ctx);
    let media=c.bienvenida_media||c.bienvenida_media_file_id;
    try{ await ctx.deleteMessage(); }catch(e){}
    if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
    await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.error("inicio", e); }
});

// PLANTILLAS - FIX FOTO + BOTONES FIJOS - SIN FIREBASE
bot.action(/ver_(.*)/, async(ctx)=>{
  try{
    await ctx.answerCbQuery();
    let id=ctx.match[1].split('_')[0].trim();
    let snap=await getDoc(doc(db,"modelos",id)); if(!snap.exists()) return;
    let m={id:snap.id,...snap.data()}; let c=await getConfig();
    let captionBase=c.plantilla_texto||"👑 {perfil} 👑\nHola {mencion}\nVotos: {votos} 👍 {porcentajeBueno}%";
    let caption=aplicarPremium(replaceVars(captionBase, m, ctx), c.plantilla_premium_log || c.plantilla_premium_ids && null);

    let canalFree = m.canalFree || m.canal_free || "https://t.me/";
    let contacto = m.contacto || (m.username? `https://t.me/${m.username}` : "https://t.me/");

    let kb=[
      [{text:"🔵 VER PERFIL COMPLETO", web_app:{url:`${WEBAPP_URL}?m=${m.id}`}, style:"primary"}],
      [
        {text:`🟢 VOTO BUENO 👍 ${m.votosBueno||0}`, callback_data:`voto_bueno_${m.id}`, style:"success"},
        {text:`🔴 VOTO MALO 👎 ${m.votosMalo||0}`, callback_data:`voto_malo_${m.id}`, style:"danger"}
      ],
      [
        {text:"🔵 CANAL FREE", url:canalFree, style:"primary"},
        {text:"🔵 CONTACTAR", url:contacto, style:"primary"}
      ],
      [
        {text:"🔴 VOLVER", callback_data:"lista", style:"danger"},
        {text:"🔴 INICIO", callback_data:"inicio", style:"danger"}
      ]
    ];

    // FIX FOTOS - todos los campos posibles
    let media = m.foto || m.foto_file_id || m.foto_url || m.fotoUrl || m.image || m.imagen || m.url || m.imagen_principal || (m.fotos && m.fotos[0]) || (m.galeria && m.galeria[0]) || null;
    try{ await ctx.deleteMessage(); }catch(e){}
    if(media){
      try{ await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }
      catch(e){ console.log("Error foto modelo", id, e.message); await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }
    }
    await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.error("ver_ error", e); }
});

bot.action(/voto_(bueno|malo)_(.*)/, async(ctx)=>{
  try{
    await ctx.answerCbQuery("Voto guardado ✅");
    let tipo=ctx.match[1]; let id=ctx.match[2];
    let ref=doc(db,"modelos",id);
    if(tipo==='bueno') await updateDoc(ref,{votosBueno:increment(1)}).catch(async()=>{ await setDoc(ref,{votosBueno:1},{merge:true}); });
    else await updateDoc(ref,{votosMalo:increment(1)}).catch(async()=>{ await setDoc(ref,{votosMalo:1},{merge:true}); });

    let snap=await getDoc(ref); let m={id:snap.id,...snap.data()}; let c=await getConfig();
    let captionBase=c.plantilla_texto||"👑 {perfil} 👑\nVotos: {votos} 👍 {porcentajeBueno}%";
    let caption=aplicarPremium(replaceVars(captionBase, m, ctx), c.plantilla_premium_log);
    let canalFree = m.canalFree || m.canal_free || "https://t.me/";
    let contacto = m.contacto || (m.username? `https://t.me/${m.username}` : "https://t.me/");

    let kb=[
      [{text:"🔵 VER PERFIL COMPLETO", web_app:{url:`${WEBAPP_URL}?m=${m.id}`}, style:"primary"}],
      [
        {text:`🟢 VOTO BUENO 👍 ${m.votosBueno||0}`, callback_data:`voto_bueno_${m.id}`, style:"success"},
        {text:`🔴 VOTO MALO 👎 ${m.votosMalo||0}`, callback_data:`voto_malo_${m.id}`, style:"danger"}
      ],
      [
        {text:"🔵 CANAL FREE", url:canalFree, style:"primary"},
        {text:"🔵 CONTACTAR", url:contacto, style:"primary"}
      ],
      [
        {text:"🔴 VOLVER", callback_data:"lista", style:"danger"},
        {text:"🔴 INICIO", callback_data:"inicio", style:"danger"}
      ]
    ];

    let media = m.foto || m.foto_file_id || m.foto_url || (m.fotos && m.fotos[0]) || null;
    try{ await ctx.deleteMessage(); }catch(e){}
    if(media){ try{ await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
    await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.error("voto", e.message); }
});

bot.action('preview_start', async(ctx)=>{
  await ctx.answerCbQuery(); let c=await getConfig();
  let textoBase=c.bienvenida_texto||"Hola {mencion}";
  let texto=aplicarPremium(replaceVars(textoBase, {}, ctx), c.bienvenida_premium_log);
  let kb=buildKeyboard(c.bienvenida_botones||[], {}, ctx);
  let media=c.bienvenida_media||c.bienvenida_media_file_id||c.bienvenida_media_url;
  try{ await ctx.deleteMessage(); }catch(e){}
  if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
  await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});

module.exports = async(req,res)=>{
  if(req.method==='GET') return res.status(200).send('Bot OK - premium + fotos fix + botones fijos');
  try{ await bot.handleUpdate(req.body); return res.status(200).send('ok'); }catch(e){ console.error(e); return res.status(200).send('ok'); }
};
