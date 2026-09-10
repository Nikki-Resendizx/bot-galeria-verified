const { Telegraf } = require('telegraf');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy } = require('firebase/firestore');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = "https://galeria-verifiedmodels.vercel.app";
const ADMIN_IDS = (process.env.ADMIN_IDS || "").split(",").map(s=>s.trim()).filter(Boolean);
const fbApp = initializeApp({ apiKey:"AIzaSyAIHevrpglvhHK3IsxpnkHlWpxnuf5o1So",authDomain:"galeria-verifiedmodels.firebaseapp.com",projectId:"galeria-verifiedmodels",storageBucket:"galeria-verifiedmodels.firebasestorage.app",messagingSenderId:"684551560793",appId:"1:684551560793:web:3730a07d8d6ec737e3db48"});
const db=getFirestore(fbApp);
const bot = new Telegraf(BOT_TOKEN);

function isAdmin(ctx){
  if(ADMIN_IDS.length===0) return true;
  return ADMIN_IDS.includes(String(ctx.from.id));
}
async function getConfig(){ try{ let s=await getDoc(doc(db,"config","bot")); if(s.exists()) return s.data(); }catch(e){} return {}; }

function getMencion(ctx){
  if(!ctx ||!ctx.from) return "👋";
  let name = (ctx.from.first_name || "amig@").replace(/[<>&]/g,'');
  return `<a href="tg://user?id=${ctx.from.id}">${name}</a>`;
}

function replaceVars(str, m={}, ctx=null){
  if(!str) return "";
  let total=(m.votosMalo||0)+(m.votosBueno||0);
  let pBueno=total?Math.round((m.votosBueno||0)/total*100):0;
  let lista=m.servicios?.map(s=>`• ${s}`).join('\n')||'• -';
  let mencion = ctx? getMencion(ctx) : "👋";
  return str.replaceAll('{mencion}', mencion).replaceAll('{perfil}', m.perfil||'').replaceAll('{username}', m.username||'').replaceAll('{edad}', m.edad||'').replaceAll('{nacionalidad}', m.nacionalidad||'').replaceAll('{servicios}', m.servicios?.join(' • ')||'-').replaceAll('{servicios_lista}', lista).replaceAll('{descripcion}', m.descripcion||'').replaceAll('{votos}', total).replaceAll('{porcentajeBueno}', pBueno).replaceAll('{porcentajeMalo}', 100-pBueno).replaceAll('{id}', m.id||'').replaceAll('{canalFree}', m.canalFree||'https://t.me/').replaceAll('{contacto}', m.contacto||`https://t.me/${m.username||''}`);
}

function buildKeyboard(btnsDef, modelo={}, ctx=null){
  let rowsMap={};
  (btnsDef||[]).forEach(b=>{
    if(!b.text) return;
    let text=replaceVars(b.text, modelo, ctx);
    let btn={text};
    if(b.style) btn.style=b.style;
    if(b.icon_custom_emoji_id) btn.icon_custom_emoji_id=b.icon_custom_emoji_id;
    if(b.type==='web_app') btn.web_app={url: replaceVars(b.url||"", modelo, ctx)};
    else if(b.type==='url') btn.url=replaceVars(b.url||"", modelo, ctx);
    else btn.callback_data=replaceVars(b.data||"", modelo, ctx);
    if(!rowsMap[b.row]) rowsMap[b.row]=[];
    rowsMap[b.row].push(btn);
  });
  return Object.keys(rowsMap).sort().map(k=>rowsMap[k]);
}

// DETECTAR EMOJI PREMIUM AUTOMATICO
function getPremiumIds(ctx){
  let ids = [];
  let entities = ctx.message.entities || ctx.message.caption_entities || [];
  for(let e of entities){
    if(e.type==='custom_emoji' && e.custom_emoji_id) ids.push(e.custom_emoji_id);
  }
  return ids;
}

let esperando={};

bot.command('admin', async(ctx)=>{
  if(!isAdmin(ctx)) return ctx.reply("❌ No eres admin: "+ctx.from.id);
  await ctx.reply(`👑 <b>PANEL DE ADMIN</b> 👑\n\n👋 BIENVENID@ AL PANEL DE CONTROL\nAQUI PODRAS MANEJAR EL DISEÑO Y FUNCIONES DEL BOT.\n\n⬇️ QUE DECEAS REALIAZAR ⬇️`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[
    [{text:"🟢 BOTON DE BIENVENIDA", callback_data:"panel_bienvenida"}, {text:"🔵 GALERÍA DE CHICAS", callback_data:"panel_galeria"}],
    [{text:"🔵 USUARIOS", callback_data:"panel_usuarios"}, {text:"🔴 PLANTILLAS", callback_data:"panel_plantillas"}],
    [{text:"🌐 ABRIR PANEL WEB COMPLETO", web_app:{url:"https://bot-galeria-verified.vercel.app/admin.html"}}]
  ]}});
});

bot.action('panel_bienvenida', async(ctx)=>{
  await ctx.answerCbQuery();
  let c=await getConfig();
  await ctx.reply(`🟢 <b>BIENVENIDA</b>\nFoto: ${c.bienvenida_media?'✅':'❌'}\nTexto: ${(c.bienvenida_texto||'').substring(0,400)}\n\nVariable: {mencion}`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[
    [{text:"📸 Cambiar Foto", callback_data:"edit_bienvenida_foto"}, {text:"📝 Texto {mencion}", callback_data:"edit_bienvenida_texto"}],
    [{text:"👁️ Preview /start", callback_data:"preview_start"}],[{text:"⬅️ Volver", callback_data:"back_panel"}]
  ]}});
});

bot.action('panel_galeria', async(ctx)=>{
  await ctx.answerCbQuery();
  let c=await getConfig();
  await ctx.reply(`🔵 <b>GALERÍA</b>\nFoto: ${c.galeria_media?'✅':'❌'}\nEmoji premium: ${c.galeria_emoji_premium||'no'}`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[
    [{text:"📸 Cambiar Foto", callback_data:"edit_galeria_foto"}, {text:"📝 Texto {mencion}", callback_data:"edit_galeria_texto"}],
    [{text:"🧩 Emoji premium botones chicas", callback_data:"edit_galeria_emoji"}],[{text:"⬅️ Volver", callback_data:"back_panel"}]
  ]}});
});

bot.action('panel_usuarios', async(ctx)=>{ await ctx.answerCbQuery(); let snap=await getDocs(collection(db,"usuarios")).catch(()=>({size:0})); await ctx.reply(`🔵 USUARIOS\nTotal: ${snap.size}`,{reply_markup:{inline_keyboard:[[{text:"⬅️ Volver", callback_data:"back_panel"}]]}}); });
bot.action('panel_plantillas', async(ctx)=>{ await ctx.answerCbQuery(); let c=await getConfig(); await ctx.reply(`🔴 PLANTILLAS\n${(c.plantilla_texto||'').substring(0,500)}\n\nVars: {mencion} {perfil}`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"📝 Editar {mencion}", callback_data:"edit_plantilla_texto"}],[{text:"⬅️ Volver", callback_data:"back_panel"}]]}}); });
bot.action('back_panel', async(ctx)=>{ await ctx.answerCbQuery(); await ctx.deleteMessage().catch(()=>{}); return bot.telegram.sendMessage(ctx.from.id, "👑 Panel:", {reply_markup:{inline_keyboard:[[{text:"🟢 BIENVENIDA", callback_data:"panel_bienvenida"}, {text:"🔵 GALERÍA", callback_data:"panel_galeria"}], [{text:"🔵 USUARIOS", callback_data:"panel_usuarios"}, {text:"🔴 PLANTILLAS", callback_data:"panel_plantillas"}], [{text:"🌐 PANEL WEB", web_app:{url:"https://bot-galeria-verified.vercel.app/admin.html"}}]]}}); });

bot.action('edit_bienvenida_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_bienvenida'; await ctx.reply("📸 Manda la FOTO de BIENVENIDA ahora"); });
bot.action('edit_bienvenida_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_bienvenida'; await ctx.reply("📝 Manda texto con {mencion}. Ej: Hola {mencion} bienvenid@ 👑\n\nSi mandas emoji premium, lo detecto automático ✅"); });
bot.action('edit_galeria_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_galeria'; await ctx.reply("📸 Manda foto GALERÍA"); });
bot.action('edit_galeria_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_galeria'; await ctx.reply("📝 Manda texto galería con {mencion}"); });
bot.action('edit_galeria_emoji', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='emoji_galeria'; await ctx.reply("🧩 Manda UN SOLO emoji premium para los botones de las chicas"); });
bot.action('edit_plantilla_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_plantilla'; await ctx.reply("📝 Manda plantilla con {mencion} {perfil} etc"); });

// FOTOS - ARREGLADO PARA URL Y FILE_ID
bot.on(['photo','document'], async(ctx)=>{
  if(!isAdmin(ctx)) return;
  let st=esperando[ctx.from.id];
  if(!st) return;
  let fileId = null;
  if(ctx.message.photo) fileId = ctx.message.photo[ctx.message.photo.length-1].file_id;
  else if(ctx.message.document) fileId = ctx.message.document.file_id;

  if(st==='foto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_media:fileId, bienvenida_media_file_id:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto bienvenida guardada: "+fileId.substring(0,20)); }
  if(st==='foto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_media:fileId, galeria_media_file_id:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto galería guardada"); }
});

bot.on('text', async(ctx)=>{
  if(!isAdmin(ctx)) return;
  let st=esperando[ctx.from.id]; if(!st) return;
  let txt=ctx.message.text;
  let premiumIds = getPremiumIds(ctx);
  let premiumId = premiumIds[0] || "";

  if(st==='texto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_texto:txt},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Texto con {mencion} guardado\nPremium detectado: ${premiumId||'no'}`); }
  if(st==='texto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_texto:txt},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Texto galería guardado"); }
  if(st==='emoji_galeria'){ let id=premiumId||txt; await setDoc(doc(db,"config","bot"),{galeria_emoji_premium:id},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Emoji premium guardado: ${id}\nSi mandaste emoji premium, ya lo detecté automático`); }
  if(st==='texto_plantilla'){ await setDoc(doc(db,"config","bot"),{plantilla_texto:txt},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Plantilla con {mencion} guardada"); }
});

bot.start(async(ctx)=>{
  try{
    let c=await getConfig();
    let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑\nBienvenid@ a Galeria", {}, ctx);
    let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 ABRIR GALERÍA", type:"web_app", url:WEBAPP_URL, row:0}, {text:"📋 Lista de chicas", type:"callback", data:"lista", row:1}], {}, ctx);
    let media = c.bienvenida_media||c.bienvenida_media_file_id||c.bienvenida_media_url;
    if(media){
      try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){ console.log("foto bienvenida error", e.message); }
    }
    await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.error("START ERROR", e); await ctx.reply("Hola 👋 Bienvenid@"); }
});

bot.action('lista', async(ctx)=>{
  await ctx.answerCbQuery(); let c=await getConfig();
  let texto=replaceVars(c.galeria_texto||"👑 GALERIA {mencion}", {}, ctx);
  let snap=await getDocs(query(collection(db,"modelos"),orderBy("fecha","desc")));
  let keyboard=[]; let row=[]; let i=0; let emojiPremium=c.galeria_emoji_premium||"";
  snap.forEach(d=>{ let m=d.data(); row.push({text:`${m.perfil||'Modelo'} @${m.username||''}`, callback_data:`ver_${d.id}`, icon_custom_emoji_id:emojiPremium||undefined}); if(row.length===3){keyboard.push(row);row=[];} i++; });
  if(row.length>0) keyboard.push(row);
  if(keyboard.length===0) keyboard.push([{text:"No hay modelos aún", callback_data:"noop"}]);
  keyboard.push([{text:"💖 ABRIR GALERÍA WEB", web_app:{url:WEBAPP_URL}}]);
  let media=c.galeria_media||c.galeria_media_file_id;
  if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}}); return; }catch(e){} }
  await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
});

bot.action(/ver_(.*)/, async(ctx)=>{
  await ctx.answerCbQuery(); let snap=await getDoc(doc(db,"modelos",ctx.match[1])); if(!snap.exists()) return ctx.reply("No existe");
  let m={id:snap.id,...snap.data()}; let c=await getConfig();
  let caption=replaceVars(c.plantilla_texto||"👑 {perfil} 👑\nHola {mencion}", m, ctx);
  let kb=buildKeyboard(c.plantilla_botones||[{text:"💖 VER", type:"web_app", url:WEBAPP_URL+"?m={id}", row:0}], m, ctx);
  try{ await ctx.replyWithPhoto(m.foto,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); }catch(e){ await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); }
});

bot.action('preview_start', async(ctx)=>{
  await ctx.answerCbQuery(); let c=await getConfig();
  let texto=replaceVars(c.bienvenida_texto||"Hola {mencion}", {}, ctx);
  let kb=buildKeyboard(c.bienvenida_botones||[], {}, ctx);
  let media=c.bienvenida_media||c.bienvenida_media_file_id;
  if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
  await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});

module.exports = async(req,res)=>{
  if(req.method==='GET') return res.status(200).send('Bot OK - 4 botones + {mencion} + premium auto');
  try{ await bot.handleUpdate(req.body); return res.status(200).send('ok'); }catch(e){ console.error(e); return res.status(200).send('ok'); }
};
