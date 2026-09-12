const { Telegraf } = require('telegraf');
const { initializeApp, getApps } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, increment, updateDoc, deleteDoc } = require('firebase/firestore');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = "https://galeria-verifiedmodels.vercel.app";
const ADMIN_IDS_ENV = (process.env.ADMIN_IDS || "").split(",").map(s=>s.trim()).filter(Boolean);

if (!getApps().length) {
  initializeApp({ apiKey:"AIzaSyAIHevrpglvhHK3IsxpnkHlWpxnuf5o1So",authDomain:"galeria-verifiedmodels.firebaseapp.com",projectId:"galeria-verifiedmodels",storageBucket:"galeria-verifiedmodels.firebasestorage.app",messagingSenderId:"684551560793",appId:"1:684551560793:web:3730a07d8d6ec737e3db48"});
}
const db=getFirestore();
const bot = new Telegraf(BOT_TOKEN);

async function getConfig(){ try{ let s=await getDoc(doc(db,"config","bot")); if(s.exists()) return s.data(); }catch(e){} return {}; }
async function isAdmin(ctx){
  let id = String(ctx.from?.id || "");
  if(ADMIN_IDS_ENV.includes(id)) return true;
  try{ let c=await getConfig(); if(c.admins && c.admins.includes(id)) return true; }catch(e){}
  if(ADMIN_IDS_ENV.length===0) return true;
  return false;
}
function getMencion(ctx){
  let name = (ctx.from.first_name || "").replace(/</g,'').replace(/>/g,'');
  return name? `<a href="tg://user?id=${ctx.from.id}">${name}</a>` : "";
}
function replaceVars(str, m={}, ctx=null){
  if(!str) return "";
  let total=(m.votosMalo||0)+(m.votosBueno||0);
  let pBueno=total?Math.round((m.votosBueno||0)/total*100):0;
  let lista=m.servicios?.map(s=>`• ${s}`).join('\n')||'• -';
  let mencion = ctx? getMencion(ctx) : "";
  return str.replaceAll('{mencion}', mencion).replaceAll('{perfil}', m.perfil||'').replaceAll('{servicios_lista}', lista).replaceAll('{votos}', String(total)).replaceAll('{id}', m.id||'');
}
function buildKeyboardWithStyle(btnsDef, modelo={}, ctx=null){
  let rowsMap={};
  (btnsDef||[]).forEach(b=>{
    let text=replaceVars(b.text||"BOTON", modelo, ctx);
    let btn={text};
    if(b.icon_custom_emoji_id) btn.icon_custom_emoji_id=String(b.icon_custom_emoji_id);
    if(b.style) btn.style=b.style;
    if(b.type==='web_app') btn.web_app={url: replaceVars(b.url||WEBAPP_URL, modelo, ctx)};
    else if(b.type==='url') btn.url=replaceVars(b.url||"https://t.me/", modelo, ctx);
    else btn.callback_data=replaceVars(b.data||"lista", modelo, ctx);
    let row=b.row??0;
    if(!rowsMap[row]) rowsMap[row]=[];
    rowsMap[row].push(btn);
  });
  return Object.keys(rowsMap).sort().map(k=>rowsMap[k]);
}
function textoConPremiumToHtml(txt, entities){
  if(!entities ||!entities.length) return txt;
  let res=txt;
  let ids=[];
  let customs=(entities||[]).filter(e=>e.type==='custom_emoji');
  [...customs].sort((a,b)=>b.offset-a.offset).forEach(e=>{
    let base=txt.substring(e.offset, e.offset+e.length);
    res=res.substring(0,e.offset)+`<tg-emoji emoji-id="${e.custom_emoji_id}">${base}</tg-emoji>`+res.substring(e.offset+e.length);
    ids.push(e.custom_emoji_id);
  });
  return {html: res, ids};
}
function getMediaModelo(m){
  let cands=[m.foto_file_id, m.foto, m.foto_url, m.fotoUrl, m.image, m.imagen, m.url, m.foto_principal, m.fotos?.[0]];
  for(let c of cands){ if(!c) continue; if(typeof c==='string' && c.length>10) return c.trim(); if(typeof c==='object' && c.file_id) return c.file_id; }
  return null;
}
let esperando={}; let plantillaTemp={};
const TEXTO_PANEL = `👑 <b>ⓅⒶⓃⒺⓁ ⒹⒺ ⒶⒹⓂⒾⓃ</b> 👑\n\n👋 <i>BIENVENID@ AL PANEL DE CONTROL DE ADMIN. AQUI PODRAS MANEJAR EL DISEÑO Y FUNCIONES DEL BOT.</i>\n\n🔗<b>HERRAMIENTAS DE ADMIN</b>🔗\n\n🧩 <b>Editar Bienvenida</b>\n🧩 <b>Crear Plantillas</b>\n🧩 <b>Editar la galeria</b>\n🧩 <b>Agregar las fotos de las modelos</b>\n🧩 <b>Ver Usuarios</b>\n🧩 <b>Agregar Admis</b>\n\n💖<b>QUE DECEAS REALIAZAR</b>💖`;

bot.start(async(ctx)=>{
  try{
    const uid=String(ctx.from.id);
    try{ const u=await getDoc(doc(db,"usuarios", uid)); if(u.exists() && u.data().banned) return ctx.reply("🚫 Baneado"); }catch(e){}
    try{ await setDoc(doc(db,"usuarios", uid), {id:uid, first_name:ctx.from.first_name||"", username:ctx.from.username||"", fecha:new Date().toISOString()}, {merge:true}); }catch(e){}
    let c=await getConfig();
    let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑\nBienvenid@ a Galeria", {}, ctx);
    let kb=buildKeyboardWithStyle(c.bienvenida_botones||[
      {text:"💖 𝗩𝗘𝗥 𝗚𝗔𝗟𝗘𝗥𝗜𝗔 𝗩𝗜𝗥𝗧𝗨𝗔𝗟 💖", type:"web_app", url:WEBAPP_URL, row:0, style:"success"},
      {text:"👑 𝗩𝗘𝗥 𝗟𝗜𝗦𝗧𝗔 𝗗𝗘 𝗠𝗢𝗗𝗘𝗟𝗢𝗦 👑", type:"callback", data:"lista", row:1, style:"primary"}
    ], {}, ctx);
    let media=c.bienvenida_media||c.bienvenida_media_file_id;
    if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
    await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){}
});

bot.command('admin', async(ctx)=>{
  if(!(await isAdmin(ctx))) return ctx.reply("❌ No eres admin");
  delete esperando[ctx.from.id];
  await ctx.reply(TEXTO_PANEL,{
    parse_mode:'HTML',
    reply_markup:{
      inline_keyboard:[
        [{text:"👋 BIENVENIDA", callback_data:"panel_bienvenida", style:"primary"}, {text:"💾 PLANTILLAS", callback_data:"panel_plantillas", style:"primary"}],
        [{text:"🖼️ GALERIA", callback_data:"panel_galeria", style:"success"}, {text:"💃 MODELOS", callback_data:"panel_modelos", style:"success"}],
        [{text:"👥 USUARIOS", callback_data:"panel_usuarios", style:"danger"}, {text:"👑 ADMINS", callback_data:"panel_admins", style:"danger"}]
      ]
    }
  });
});
bot.command('cancel', async(ctx)=>{ delete esperando[ctx.from.id]; await ctx.reply("✅ Cancelado, vuelve a /admin"); });

// SUBPANELES - AHORA SI JALAN
bot.action('panel_bienvenida', async(ctx)=>{
  await ctx.answerCbQuery().catch(()=>{});
  let c=await getConfig();
  await ctx.reply(`👋 <b>BIENVENIDA</b>\n\nFoto: ${c.bienvenida_media?'✅':'❌'}\nTexto: ${(c.bienvenida_texto||'vacio').substring(0,250)}\n\n¿Qué quieres editar?`,{
    parse_mode:'HTML',
    reply_markup:{inline_keyboard:[
      [{text:"📸 Cambiar FOTO", callback_data:"edit_bienvenida_foto", style:"primary"}, {text:"📝 Cambiar TEXTO", callback_data:"edit_bienvenida_texto", style:"primary"}],
      [{text:"🧩 Cambiar Emoji Premium", callback_data:"edit_bienvenida_emoji", style:"success"}],
      [{text:"👁️ Ver Preview /start", callback_data:"preview_start", style:"success"}],
      [{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]
    ]}
  });
});
bot.action('panel_galeria', async(ctx)=>{
  await ctx.answerCbQuery().catch(()=>{});
  let c=await getConfig();
  await ctx.reply(`🖼️ <b>GALERIA</b>\n\nFoto: ${c.galeria_media?'✅':'❌'}\nTexto: ${(c.galeria_texto||'vacio').substring(0,250)}`,{
    parse_mode:'HTML',
    reply_markup:{inline_keyboard:[
      [{text:"📸 Cambiar FOTO", callback_data:"edit_galeria_foto", style:"primary"}, {text:"📝 Cambiar TEXTO", callback_data:"edit_galeria_texto", style:"primary"}],
      [{text:"🧩 Cambiar Emoji Premium", callback_data:"edit_galeria_emoji", style:"success"}],
      [{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]
    ]}
  });
});
bot.action('panel_plantillas', async(ctx)=>{
  await ctx.answerCbQuery().catch(()=>{});
  let c=await getConfig();
  let snap=await getDocs(collection(db,"plantillas")).catch(()=>({docs:[]}));
  let kb=[];
  snap.docs.slice(0,10).forEach(d=>{
    kb.push([{text:`📄 ${d.data().nombre||d.id.slice(-5)}`, callback_data:`plantilla_use_${d.id}`, style:"primary"}, {text:"🗑️", callback_data:`plantilla_del_${d.id}`, style:"danger"}]);
  });
  kb.push([{text:"➕ CREAR NUEVA PLANTILLA", callback_data:"edit_plantilla_texto", style:"success"}]);
  kb.push([{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]);
  await ctx.reply(`💾 <b>PLANTILLAS</b> (${snap.docs.length})\n\nActiva:\n${(c.plantilla_texto||'vacia').substring(0,400)}\n\nToca para activar`,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});
bot.action('panel_modelos', async(ctx)=>{
  await ctx.answerCbQuery().catch(()=>{});
  let snap; try{ snap=await getDocs(query(collection(db,"modelos"),orderBy("fecha","desc"))); }catch{ snap=await getDocs(collection(db,"modelos")); }
  let kb=[]; let row=[];
  snap.forEach(d=>{
    let m=d.data();
    let has = getMediaModelo(m)? "📸" : "❌";
    let btn={text:`${has} ${m.perfil||d.id}`, callback_data:`mfoto_${d.id}`, style: getMediaModelo(m)?"success":"danger"};
    row.push(btn);
    if(row.length===2){ kb.push(row); row=[]; }
  });
  if(row.length>0) kb.push(row);
  kb.push([{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]);
  await ctx.reply(`💃 <b>MODELOS - FOTO POR BOTON</b> (${snap.size})\n\nToca una chica y luego manda su foto nueva\n📸=con foto ❌=sin foto`,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});
bot.action(/mfoto_(.*)/, async(ctx)=>{
  if(!(await isAdmin(ctx))) return;
  await ctx.answerCbQuery().catch(()=>{});
  let id=ctx.match[1];
  let s=await getDoc(doc(db,"modelos",id));
  if(!s.exists()) return ctx.reply("❌ No existe");
  esperando[ctx.from.id]=`foto_modelo_${id}`;
  await ctx.reply(`📸 <b>${s.data().perfil||id}</b>\n\nManda la FOTO nueva ahora como foto (no archivo)\n/cancel para cancelar`,{parse_mode:'HTML'});
});
bot.action('panel_usuarios', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); let snap=await getDocs(collection(db,"usuarios")).catch(()=>({size:0})); await ctx.reply(`👥 Usuarios totales: ${snap.size}\n\nComandos:\n/ban ID\n/unban ID`,{reply_markup:{inline_keyboard:[[{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]]}}); });
bot.action('panel_admins', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); let c=await getConfig(); await ctx.reply(`👑 Admins: ${(c.admins||[]).join(',')||'ninguno'}\n\n/addadmin ID\n/deladmin ID`,{reply_markup:{inline_keyboard:[[{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]]}}); });

bot.action('edit_bienvenida_foto', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); esperando[ctx.from.id]='foto_bienvenida'; await ctx.reply("📸 Manda la FOTO de bienvenida AHORA\n/cancel para salir"); });
bot.action('edit_bienvenida_texto', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); esperando[ctx.from.id]='texto_bienvenida'; await ctx.reply("📝 Manda el TEXTO de bienvenida\nPuedes usar {mencion} y emojis premium\n/cancel para salir"); });
bot.action('edit_bienvenida_emoji', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); esperando[ctx.from.id]='emoji_bienvenida'; await ctx.reply("🧩 Manda 1 emoji PREMIUM para los botones\n/cancel para salir"); });
bot.action('edit_galeria_foto', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); esperando[ctx.from.id]='foto_galeria'; await ctx.reply("📸 Manda la FOTO de galeria\n/cancel para salir"); });
bot.action('edit_galeria_texto', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); esperando[ctx.from.id]='texto_galeria'; await ctx.reply("📝 Manda el TEXTO de galeria con {mencion}\n/cancel para salir"); });
bot.action('edit_galeria_emoji', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); esperando[ctx.from.id]='emoji_galeria'; await ctx.reply("🧩 Manda 1 emoji PREMIUM para galeria\n/cancel para salir"); });
bot.action('edit_plantilla_texto', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); esperando[ctx.from.id]='texto_plantilla'; await ctx.reply("📝 Manda el TEXTO de la plantilla con {mencion} {perfil} {servicios_lista}\nLuego te pido el nombre\n/cancel para salir"); });

bot.action(/plantilla_use_(.*)/, async(ctx)=>{ if(!(await isAdmin(ctx))) return; let s=await getDoc(doc(db,"plantillas",ctx.match[1])); if(!s.exists()) return ctx.answerCbQuery("No existe"); await setDoc(doc(db,"config","bot"),{plantilla_texto:s.data().texto},{merge:true}); await ctx.answerCbQuery("✅ Activada"); await ctx.reply(`✅ Plantilla activada: ${s.data().nombre}`); });
bot.action(/plantilla_del_(.*)/, async(ctx)=>{ if(!(await isAdmin(ctx))) return; await deleteDoc(doc(db,"plantillas",ctx.match[1])); await ctx.answerCbQuery("Eliminada"); await ctx.reply("🗑️ Eliminada"); });
bot.action('back_admin', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); try{ await ctx.deleteMessage(); }catch(e){} await bot.telegram.sendMessage(ctx.from.id, TEXTO_PANEL, {parse_mode:'HTML', reply_markup:{inline_keyboard:[
  [{text:"👋 BIENVENIDA", callback_data:"panel_bienvenida", style:"primary"}, {text:"💾 PLANTILLAS", callback_data:"panel_plantillas", style:"primary"}],
  [{text:"🖼️ GALERIA", callback_data:"panel_galeria", style:"success"}, {text:"💃 MODELOS", callback_data:"panel_modelos", style:"success"}],
  [{text:"👥 USUARIOS", callback_data:"panel_usuarios", style:"danger"}, {text:"👑 ADMINS", callback_data:"panel_admins", style:"danger"}]
]}}); });
bot.action('preview_start', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); let c=await getConfig(); let texto=replaceVars(c.bienvenida_texto||"Hola {mencion}",{},ctx); let media=c.bienvenida_media; if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML'}); return; }catch(e){} } await ctx.reply(texto,{parse_mode:'HTML'}); });

bot.on(['photo'], async(ctx)=>{
  if(!(await isAdmin(ctx))) return;
  let fileId=ctx.message.photo[ctx.message.photo.length-1].file_id;
  let st=esperando[ctx.from.id];
  if(!st) return;
  if(st.startsWith('foto_modelo_')){
    let id=st.replace('foto_modelo_','');
    await setDoc(doc(db,"modelos",id),{foto_file_id:fileId, foto:fileId, foto_url:fileId},{merge:true});
    delete esperando[ctx.from.id];
    return ctx.reply(`✅ Foto de modelo guardada 📸`);
  }
  if(st==='foto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_media:fileId, bienvenida_media_file_id:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto BIENVENIDA guardada. Haz /start para ver"); }
  if(st==='foto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_media:fileId, galeria_media_file_id:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto GALERIA guardada. Haz /admin > galeria"); }
});

bot.on('text', async(ctx)=>{
  let txt=ctx.message.text; if(txt.startsWith('/')) return;
  if(!(await isAdmin(ctx))) return;
  let st=esperando[ctx.from.id]; if(!st) return;
  let conv=textoConPremiumToHtml(txt, ctx.message.entities||[]);
  let htmlText=typeof conv==='object'?conv.html:txt;
  let first=typeof conv==='object'? (conv.ids[0]||"") : "";

  if(st==='texto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_texto:htmlText},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Texto BIENVENIDA guardado. /admin > preview para ver"); }
  if(st==='emoji_bienvenida'){ if(!first) return ctx.reply("❌ Manda un emoji PREMIUM de verdad, no normal"); await setDoc(doc(db,"config","bot"),{bienvenida_emoji_premium:first, galeria_emoji_premium:first},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Emoji guardado: ${first}`); }
  if(st==='texto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_texto:htmlText},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Texto GALERIA guardado"); }
  if(st==='emoji_galeria'){ if(!first) return ctx.reply("❌ Manda un emoji PREMIUM"); await setDoc(doc(db,"config","bot"),{galeria_emoji_premium:first},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Emoji galeria: ${first}`); }
  if(st==='texto_plantilla'){ plantillaTemp[ctx.from.id]={texto:htmlText}; esperando[ctx.from.id]='nombre_plantilla'; return ctx.reply("Ahora manda el NOMBRE de la plantilla (ej: Plantilla 1)"); }
  if(st==='nombre_plantilla'){ let temp=plantillaTemp[ctx.from.id]; let nombre=txt.slice(0,40); let newId=Date.now().toString(); await setDoc(doc(db,"plantillas",newId),{nombre, texto:temp.texto, fecha:new Date().toISOString()}); await setDoc(doc(db,"config","bot"),{plantilla_texto:temp.texto},{merge:true}); delete esperando[ctx.from.id]; delete plantillaTemp[ctx.from.id]; return ctx.reply(`✅ Plantilla "${nombre}" creada y activada`); }
});

bot.action('lista', async(ctx)=>{
  try{ await ctx.answerCbQuery().catch(()=>{}); let c=await getConfig(); let texto=replaceVars(c.galeria_texto||"👑 GALERIA {mencion}", {}, ctx); let snap; try{ snap=await getDocs(query(collection(db,"modelos"),orderBy("fecha","desc"))); }catch{ snap=await getDocs(collection(db,"modelos")); } let keyboard=[]; let row=[]; snap.forEach(d=>{ let m=d.data(); let nombre=(m.perfil||d.id).replace(/@/g,'').trim(); let btn={text:nombre, callback_data:`ver_${d.id}`, style: row.length===0? "primary" : "danger"}; let emoji=c.galeria_emoji_premium||c.bienvenida_emoji_premium; if(emoji) btn.icon_custom_emoji_id=String(emoji); row.push(btn); if(row.length===2){ keyboard.push(row); row=[]; } }); if(row.length>0) keyboard.push(row); let emojiMain=c.galeria_emoji_premium||c.bienvenida_emoji_premium||""; let galBtn={text:"𝗩𝗘𝗥 𝗚𝗔𝗟𝗘𝗥𝗜𝗔 𝗩𝗜𝗥𝗧𝗨𝗔𝗟 💖", web_app:{url:WEBAPP_URL}, style:"success"}; if(emojiMain) galBtn.icon_custom_emoji_id=String(emojiMain); keyboard.push([galBtn]); let media=c.galeria_media||c.galeria_media_file_id; try{ await ctx.deleteMessage(); }catch(e){} if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}}); return; }catch(e){} } await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}}); }catch(e){}
});
bot.action(/ver_(.*)/, async(ctx)=>{
  await ctx.answerCbQuery().catch(()=>{});
  let id=ctx.match[1].trim();
  let snap=await getDoc(doc(db,"modelos",id));
  if(!snap.exists()) return ctx.reply("❌ No existe");
  let m={id:snap.id,...snap.data()};
  let c=await getConfig();
  let caption=replaceVars(c.plantilla_texto||"👑 {perfil} 👑\nHola {mencion}", m, ctx);
  let media=getMediaModelo(m);
  let kb=[[{text:"💖 𝗩𝗘𝗥 𝗣𝗘𝗥𝗙𝗜𝗟 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗢 💖", web_app:{url:`${WEBAPP_URL}?m=${m.id}`}, style:"success"}],[{text:"👈🏻 VOLVER", callback_data:"lista", style:"danger"}, {text:"👑 INICIO", callback_data:"inicio", style:"danger"}]];
  try{ await ctx.deleteMessage(); }catch(e){}
  if(media){ try{ await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
  await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});
bot.action('inicio', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); let c=await getConfig(); let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑", {}, ctx); let kb=buildKeyboardWithStyle(c.bienvenida_botones||[{text:"💖 ABRIR GALERÍA", type:"web_app", url:WEBAPP_URL, row:0, style:"success"},{text:"📋 VER LISTA", type:"callback", data:"lista", row:1, style:"primary"}], {}, ctx); let media=c.bienvenida_media||c.bienvenida_media_file_id; try{ await ctx.deleteMessage(); }catch(e){} if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} } await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); });

module.exports = async(req,res)=>{
  if(req.method==='GET') return res.status(200).send('Bot OK sin WED - todo por botones');
  try{ await bot.handleUpdate(req.body); return res.status(200).send('ok'); }catch(e){ console.error(e); return res.status(200).send('ok'); }
};
