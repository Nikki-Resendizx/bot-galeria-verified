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
  return str.replaceAll('{mencion}', mencion).replaceAll('{perfil}', m.perfil||'').replaceAll('{username}', m.username||'').replaceAll('{edad}', String(m.edad||'')).replaceAll('{nacionalidad}', m.nacionalidad||'').replaceAll('{servicios}', m.servicios?.join(' • ')||'-').replaceAll('{servicios_lista}', lista).replaceAll('{descripcion}', m.descripcion||'').replaceAll('{votos}', String(total)).replaceAll('{porcentajeBueno}', String(pBueno)).replaceAll('{porcentajeMalo}', String(100-pBueno)).replaceAll('{id}', m.id||'').replaceAll('{canalFree}', m.canalFree||'https://t.me/').replaceAll('{contacto}', m.contacto||`https://t.me/${m.username||''}`);
}
function buildKeyboardWithStyle(btnsDef, modelo={}, ctx=null){
  let rowsMap={};
  if(!Array.isArray(btnsDef)) return [];
  btnsDef.forEach(b=>{
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
  let premiumLog=[];
  for(const e of entities) if(e.type==='custom_emoji') premiumLog.push({id:e.custom_emoji_id, base:txt.substring(e.offset, e.offset+e.length), offset:e.offset, length:e.length});
  if(!premiumLog.length) return txt;
  let res=txt;
  [...premiumLog].sort((a,b)=>b.offset-a.offset).forEach(p=>{ res = res.substring(0,p.offset) + `<tg-emoji emoji-id="${p.id}">${p.base}</tg-emoji>` + res.substring(p.offset+p.length); });
  return {html: res, ids: premiumLog.map(p=>p.id)};
}
function getMediaModelo(m){
  let cands=[m.foto_file_id, m.foto, m.foto_url, m.fotoUrl, m.image, m.imagen, m.url, m.foto_principal, m.fotos?.[0], m.galeria?.[0]];
  for(let c of cands){
    if(!c) continue;
    if(typeof c==='string' && c.length>10) return c.trim();
    if(typeof c==='object' && c.file_id) return c.file_id;
    if(typeof c==='object' && c.url) return c.url;
  }
  return null;
}
let esperando={}; let plantillaTemp={};
const TEXTO_PANEL_ADMIN = `👑 <b>ⓅⒶⓃⒺⓁ ⒹⒺ ⒶⒹⓂⒾⓃ</b> 👑\n\n👋 <i>BIENVENID@ AL PANEL DE CONTROL DE ADMIN. AQUI PODRAS MANEJAR EL DISEÑO Y FUNCIONES DEL BOT.</i>\n\n🔗<b>HERRAMIENTAS DE ADMIN</b>🔗\n\n<i>ESTAS SON LAS FUNCIONES QUE PODRAS MANEJAR ATRAVEZ DE LOS BOTONES DEL PANEL</i>\n\n🧩 <b>Editar Bienvenida</b>\n🧩 <b>Crear Plantillas</b>\n🧩 <b>Editar la galeria</b>\n🧩 <b>Agregar las fotos de las modelos</b>\n🧩 <b>Ver Usuarios</b> (<i>banear / desbanear</i>)\n🧩 <b>Agregar Admis</b>\n🧩 <b>Editar botones de Bienvenida, Plantilla y galeria</b>\n\n💖<b>QUE DECEAS REALIAZAR</b>💖`;

bot.start(async(ctx)=>{
  try{
    const uid=String(ctx.from.id);
    try{ const u=await getDoc(doc(db,"usuarios", uid)); if(u.exists() && u.data().banned) return ctx.reply("🚫 Estás baneado"); }catch(e){}
    try{ await setDoc(doc(db,"usuarios", uid), {id:uid, first_name:ctx.from.first_name||"", username:ctx.from.username||"", fecha:new Date().toISOString(), last_start:Date.now(), banned:false}, {merge:true}); }catch(e){}
    let c=await getConfig();
    let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑\nBienvenid@ a Galeria", {}, ctx);
    let emoji=c.bienvenida_emoji_premium||c.galeria_emoji_premium||"";
    let kb=buildKeyboardWithStyle(c.bienvenida_botones||[
      {text:"💖 𝗩𝗘𝗥 𝗚𝗔𝗟𝗘𝗥𝗜𝗔 𝗩𝗜𝗥𝗧𝗨𝗔𝗟 💖", type:"web_app", url:WEBAPP_URL, row:0, style:"success", icon_custom_emoji_id:emoji},
      {text:"👑 𝗩𝗘𝗥 𝗟𝗜𝗦𝗧𝗔 𝗗𝗘 𝗠𝗢𝗗𝗘𝗟𝗢𝗦 👑", type:"callback", data:"lista", row:1, style:"primary", icon_custom_emoji_id:emoji}
    ], {}, ctx);
    let media=c.bienvenida_media||c.bienvenida_media_file_id;
    if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
    await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.error("START", e); }
});

bot.command('cancel', async(ctx)=>{ delete esperando[ctx.from.id]; delete plantillaTemp[ctx.from.id]; await ctx.reply("✅ Cancelado"); });
bot.command('admin', async(ctx)=>{
  if(!(await isAdmin(ctx))) return ctx.reply("❌ No eres admin");
  await ctx.reply(TEXTO_PANEL_ADMIN,{
    parse_mode:'HTML',
    reply_markup:{
      inline_keyboard:[
        [{text:"👋 BIENVENIDA", callback_data:"panel_bienvenida", style:"primary"}, {text:"💾 PLANTILLAS", callback_data:"panel_plantillas", style:"primary"}],
        [{text:"🖼️ GALERIA", callback_data:"panel_galeria", style:"success"}, {text:"💃 MODELOS", callback_data:"panel_modelos", style:"success"}],
        [{text:"👥 USUARIOS", callback_data:"panel_usuarios", style:"danger"}, {text:"👑 ADMINS", callback_data:"panel_admins", style:"danger"}],
        [{text:"💻 ADMIN PANEL WED", web_app:{url:"https://bot-galeria-verified.vercel.app/admin.html"}, style:"primary"}]
      ]
    }
  });
});
bot.command('setfoto', async(ctx)=>{
  if(!(await isAdmin(ctx))) return;
  let id = ctx.message.text.split(' ')[1];
  if(!id) return ctx.reply("Usa /setfoto ID (o usa el botón 💃 MODELOS que es más fácil)");
  let reply = ctx.message.reply_to_message;
  if(!reply ||!reply.photo) return ctx.reply(`Responde a una FOTO con /setfoto ${id}`);
  let fileId = reply.photo[reply.photo.length-1].file_id;
  await setDoc(doc(db,"modelos",id),{foto_file_id:fileId, foto:fileId, foto_url:fileId},{merge:true});
  await ctx.reply(`✅ Foto guardada para ${id}`);
});

// PANEL ACCIONES
bot.action('panel_bienvenida', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} let c=await getConfig(); await ctx.reply(`👋 <b>BIENVENIDA</b>\nFoto: ${c.bienvenida_media?'✅':'❌'}\nTexto: ${(c.bienvenida_texto||'').substring(0,300)}`,{parse_mode:'HTML', reply_markup:{inline_keyboard:[[{text:"📸 Foto", callback_data:"edit_bienvenida_foto", style:"primary"}, {text:"📝 Texto", callback_data:"edit_bienvenida_texto", style:"primary"}], [{text:"🧩 Emoji", callback_data:"edit_bienvenida_emoji", style:"primary"}, {text:"🔘 Botones", callback_data:"edit_bienvenida_botones", style:"success"}], [{text:"👁️ Preview", callback_data:"preview_start", style:"success"}], [{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]]}}); });
bot.action('panel_galeria', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} let c=await getConfig(); await ctx.reply(`🖼️ <b>GALERIA</b>\nFoto: ${c.galeria_media?'✅':'❌'}\nTexto: ${(c.galeria_texto||'').substring(0,300)}`,{parse_mode:'HTML', reply_markup:{inline_keyboard:[[{text:"📸 Foto", callback_data:"edit_galeria_foto", style:"primary"}, {text:"📝 Texto", callback_data:"edit_galeria_texto", style:"primary"}], [{text:"🧩 Emoji", callback_data:"edit_galeria_emoji", style:"primary"}], [{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]]}}); });
bot.action('panel_plantillas', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} let c=await getConfig(); let snap=await getDocs(collection(db,"plantillas")).catch(()=>({docs:[]})); let kb=[]; snap.docs.slice(0,8).forEach(d=>{ kb.push([{text:`📄 ${d.data().nombre||d.id.slice(-6)}`, callback_data:`plantilla_use_${d.id}`, style:"primary"}, {text:"🗑️", callback_data:`plantilla_del_${d.id}`, style:"danger"}]); }); kb.push([{text:"➕ Nueva Plantilla", callback_data:"edit_plantilla_texto", style:"success"}]); kb.push([{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]); await ctx.reply(`💾 <b>PLANTILLAS</b>\nActiva: ${(c.plantilla_texto||'').substring(0,300)}\nGuardadas: ${snap.docs.length}`,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); });

// MODELOS CON BOTON PARA FOTO - TU PETICION NUEVA
bot.action('panel_modelos', async(ctx)=>{
  try{ await ctx.answerCbQuery(); }catch(e){}
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
  kb.push([{text:"🌐 Admin Web", web_app:{url:"https://bot-galeria-verified.vercel.app/admin.html"}, style:"primary"}]);
  kb.push([{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]);
  await ctx.reply(`💃 <b>MODELOS - CAMBIAR FOTO POR BOTON</b> (${snap.size})\n\n<i>Toca el nombre de la chica y luego manda la foto. Ya no necesitas ID ni /setfoto</i>\n📸 = con foto | ❌ = sin foto`,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});
bot.action(/mfoto_(.*)/, async(ctx)=>{
  if(!(await isAdmin(ctx))) return;
  try{ await ctx.answerCbQuery(); }catch(e){}
  let id=ctx.match[1];
  let snap=await getDoc(doc(db,"modelos",id));
  if(!snap.exists()) return ctx.reply("❌ No existe");
  let m=snap.data();
  esperando[ctx.from.id]=`foto_modelo_${id}`;
  await ctx.reply(`📸 <b>${m.perfil||id}</b>\nAhora manda la FOTO nueva para ella como foto normal`,{parse_mode:'HTML'});
});

bot.action('panel_usuarios', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} let snap=await getDocs(collection(db,"usuarios")).catch(()=>({size:0})); await ctx.reply(`👥 USUARIOS: ${snap.size}\n/ban ID /unban ID`,{reply_markup:{inline_keyboard:[[{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]]}}); });
bot.action('panel_admins', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} let c=await getConfig(); await ctx.reply(`👑 ADMINS\nENV: ${(ADMIN_IDS_ENV||[]).join(',')}\nFS: ${(c.admins||[]).join(',')}\n/addadmin ID /deladmin ID`,{reply_markup:{inline_keyboard:[[{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]]}}); });
bot.action(/plantilla_use_(.*)/, async(ctx)=>{ if(!(await isAdmin(ctx))) return; let s=await getDoc(doc(db,"plantillas",ctx.match[1])); if(!s.exists()) return ctx.answerCbQuery("No existe"); await setDoc(doc(db,"config","bot"),{plantilla_texto:s.data().texto},{merge:true}); await ctx.answerCbQuery("✅ Activada"); });
bot.action(/plantilla_del_(.*)/, async(ctx)=>{ if(!(await isAdmin(ctx))) return; await deleteDoc(doc(db,"plantillas",ctx.match[1])); await ctx.answerCbQuery("Eliminada"); });
bot.action('back_admin', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} try{ await ctx.deleteMessage(); }catch(e){} return bot.telegram.sendMessage(ctx.from.id, TEXTO_PANEL_ADMIN, {parse_mode:'HTML', reply_markup:{inline_keyboard:[
  [{text:"👋 BIENVENIDA", callback_data:"panel_bienvenida", style:"primary"}, {text:"💾 PLANTILLAS", callback_data:"panel_plantillas", style:"primary"}],
  [{text:"🖼️ GALERIA", callback_data:"panel_galeria", style:"success"}, {text:"💃 MODELOS", callback_data:"panel_modelos", style:"success"}],
  [{text:"👥 USUARIOS", callback_data:"panel_usuarios", style:"danger"}, {text:"👑 ADMINS", callback_data:"panel_admins", style:"danger"}],
  [{text:"💻 ADMIN PANEL WED", web_app:{url:"https://bot-galeria-verified.vercel.app/admin.html"}, style:"primary"}]
]}}); });

// EDITAR HANDLERS
bot.action('edit_bienvenida_foto', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} esperando[ctx.from.id]='foto_bienvenida'; await ctx.reply("📸 Manda FOTO bienvenida"); });
bot.action('edit_bienvenida_texto', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} esperando[ctx.from.id]='texto_bienvenida'; await ctx.reply("📝 Manda texto {mencion}"); });
bot.action('edit_bienvenida_emoji', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} esperando[ctx.from.id]='emoji_bienvenida'; await ctx.reply("🧩 Manda emoji premium"); });
bot.action('edit_bienvenida_botones', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} await ctx.reply("🔘 Edita bienvenida_botones en Admin Web o Firestore, con style: primary/success/danger"); });
bot.action('edit_galeria_foto', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} esperando[ctx.from.id]='foto_galeria'; await ctx.reply("📸 Manda foto GALERIA"); });
bot.action('edit_galeria_texto', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} esperando[ctx.from.id]='texto_galeria'; await ctx.reply("📝 Manda texto galeria {mencion}"); });
bot.action('edit_galeria_emoji', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} esperando[ctx.from.id]='emoji_galeria'; await ctx.reply("🧩 Manda emoji premium perfil"); });
bot.action('edit_plantilla_texto', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} esperando[ctx.from.id]='texto_plantilla'; await ctx.reply("📝 Manda plantilla {mencion} {perfil} {servicios_lista}"); });

bot.on(['photo'], async(ctx)=>{
  if(!(await isAdmin(ctx))) return;
  let fileId=ctx.message.photo[ctx.message.photo.length-1].file_id;
  let st=esperando[ctx.from.id];
  if(st && st.startsWith('foto_modelo_')){
    let id=st.replace('foto_modelo_','');
    await setDoc(doc(db,"modelos",id),{foto_file_id:fileId, foto:fileId, foto_url:fileId},{merge:true});
    delete esperando[ctx.from.id];
    await ctx.reply(`✅ Foto cambiada para ${id} 📸`);
    let snap2; try{ snap2=await getDocs(query(collection(db,"modelos"),orderBy("fecha","desc"))); }catch{ snap2=await getDocs(collection(db,"modelos")); }
    let kb=[]; let row=[];
    snap2.forEach(d=>{
      let mm=d.data();
      let has = getMediaModelo(mm)? "📸" : "❌";
      let btn={text:`${has} ${mm.perfil||d.id}`, callback_data:`mfoto_${d.id}`, style: getMediaModelo(mm)?"success":"danger"};
      row.push(btn);
      if(row.length===2){ kb.push(row); row=[]; }
    });
    if(row.length>0) kb.push(row);
    kb.push([{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]);
    return ctx.reply(`Sigue cambiando:`,{reply_markup:{inline_keyboard:kb}});
  }
  if(st==='foto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_media:fileId, bienvenida_media_file_id:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto bienvenida guardada"); }
  if(st==='foto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_media:fileId, galeria_media_file_id:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto galeria guardada"); }
});
bot.on('text', async(ctx)=>{
  let txt=ctx.message.text; if(txt.startsWith('/')) return;
  if(!(await isAdmin(ctx))) return;
  let st=esperando[ctx.from.id]; if(!st) return;
  let conv=textoConPremiumToHtml(txt, ctx.message.entities||[]);
  let htmlText=typeof conv==='object'?conv.html:conv;
  let premiumIds=typeof conv==='object'?conv.ids:[];
  let first=premiumIds[0]||txt.trim();
  if(st==='texto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_texto:htmlText},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Bienvenida guardada"); }
  if(st==='emoji_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_emoji_premium:String(first), galeria_emoji_premium:String(first)},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Emoji: ${first}`); }
  if(st==='texto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_texto:htmlText},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Galeria guardada"); }
  if(st==='emoji_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_emoji_premium:String(first)},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Emoji perfil: ${first}`); }
  if(st==='texto_plantilla'){ plantillaTemp[ctx.from.id]={texto:htmlText}; esperando[ctx.from.id]='nombre_plantilla'; return ctx.reply("Ahora manda el NOMBRE"); }
  if(st==='nombre_plantilla'){ let temp=plantillaTemp[ctx.from.id]; let nombre=txt.trim().slice(0,40); let newId=Date.now().toString(); await setDoc(doc(db,"plantillas",newId),{nombre, texto:temp.texto, fecha:new Date().toISOString()}); await setDoc(doc(db,"config","bot"),{plantilla_texto:temp.texto},{merge:true}); delete esperando[ctx.from.id]; delete plantillaTemp[ctx.from.id]; return ctx.reply(`✅ Plantilla "${nombre}" guardada`); }
});
bot.action('lista', async(ctx)=>{
  try{ try{ await ctx.answerCbQuery(); }catch(e){} let c=await getConfig(); let texto=replaceVars(c.galeria_texto||"👑 GALERIA {mencion}", {}, ctx); let snap; try{ snap=await getDocs(query(collection(db,"modelos"),orderBy("fecha","desc"))); }catch{ snap=await getDocs(collection(db,"modelos")); } let keyboard=[]; let row=[]; snap.forEach(d=>{ let m=d.data(); let nombre=(m.perfil||d.id).replace(/@/g,'').trim(); let btn={text:nombre, callback_data:`ver_${d.id}`, style: row.length===0? "primary" : "danger"}; let emoji=c.galeria_emoji_premium||c.bienvenida_emoji_premium; if(emoji) btn.icon_custom_emoji_id=String(emoji); row.push(btn); if(row.length===2){ keyboard.push(row); row=[]; } }); if(row.length>0) keyboard.push(row); let emojiMain=c.galeria_emoji_premium||c.bienvenida_emoji_premium||""; let galBtn={text:"𝗩𝗘𝗥 𝗚𝗔𝗟𝗘𝗥𝗜𝗔 𝗩𝗜𝗥𝗧𝗨𝗔𝗟 💖", web_app:{url:WEBAPP_URL}, style:"success"}; if(emojiMain) galBtn.icon_custom_emoji_id=String(emojiMain); keyboard.push([galBtn]); let media=c.galeria_media||c.galeria_media_file_id; try{ await ctx.deleteMessage(); }catch(e){} if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}}); return; }catch(e){} } await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}}); }catch(e){ console.error("lista", e); }
});
bot.action(/ver_(.*)/, async(ctx)=>{
  try{ await ctx.answerCbQuery(); }catch(e){}
  let id=ctx.match[1].split('_')[0].trim();
  let snap=await getDoc(doc(db,"modelos",id));
  if(!snap.exists()) return ctx.reply("❌ No existe");
  let m={id:snap.id,...snap.data()};
  let c=await getConfig();
  let caption=replaceVars(c.plantilla_texto||"👑 {perfil} 👑\nHola {mencion}\nVotos: {votos}", m, ctx);
  let canalFree=m.canalFree||m.canal_free||"https://t.me/";
  let contacto=m.contacto||(m.username?`https://t.me/${m.username}`:"https://t.me/");
  let emoji=c.galeria_emoji_premium||c.bienvenida_emoji_premium||"";
  let eObj=emoji?{icon_custom_emoji_id:String(emoji)}:{};
  let kb=[
    [{text:"💖 𝗩𝗘𝗥 𝗣𝗘𝗥𝗙𝗜𝗟 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗢 💖", web_app:{url:`${WEBAPP_URL}?m=${m.id}`}, style:"success",...eObj}],
    [{text:`👍 Bueno ${m.votosBueno||0}`, callback_data:`voto_bueno_${m.id}`, style:"success",...eObj}, {text:`👎 Malo ${m.votosMalo||0}`, callback_data:`voto_malo_${m.id}`, style:"danger"}],
    [{text:"💎 𝗖𝗔𝗡𝗔𝗟 𝗙𝗥𝗘𝗘", url:canalFree, style:"primary",...eObj}, {text:"💬 𝗖𝗢𝗡𝗧𝗔𝗖𝗧𝗔𝗥", url:contacto, style:"primary",...eObj}],
    [{text:"👈🏻 VOLVER", callback_data:"lista", style:"danger"}, {text:"👑 INICIO", callback_data:"inicio", style:"danger"}]
  ];
  let media=getMediaModelo(m);
  try{ await ctx.deleteMessage(); }catch(e){}
  if(media){ try{ await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} try{ await ctx.replyWithPhoto({url: media},{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
  await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});
bot.action('inicio', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} let c=await getConfig(); let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑", {}, ctx); let emoji=c.bienvenida_emoji_premium||""; let kb=buildKeyboardWithStyle(c.bienvenida_botones||[{text:"💖 ABRIR GALERÍA", type:"web_app", url:WEBAPP_URL, row:0, style:"success", icon_custom_emoji_id:emoji},{text:"📋 VER LISTA", type:"callback", data:"lista", row:1, style:"primary", icon_custom_emoji_id:emoji}], {}, ctx); let media=c.bienvenida_media||c.bienvenida_media_file_id; try{ await ctx.deleteMessage(); }catch(e){} if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} } await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); });
bot.action(/voto_(bueno|malo)_(.*)/, async(ctx)=>{ try{ await ctx.answerCbQuery("✅"); let tipo=ctx.match[1]; let id=ctx.match[2]; let ref=doc(db,"modelos",id); if(tipo==='bueno') await updateDoc(ref,{votosBueno:increment(1)}).catch(async()=>{ await setDoc(ref,{votosBueno:1},{merge:true}); }); else await updateDoc(ref,{votosMalo:increment(1)}).catch(async()=>{ await setDoc(ref,{votosMalo:1},{merge:true}); }); let snap=await getDoc(ref); let m={id:snap.id,...snap.data()}; let c=await getConfig(); let caption=replaceVars(c.plantilla_texto||"👑 {perfil} Votos {votos}", m, ctx); let media=getMediaModelo(m); let kb=[[{text:`👍 Bueno ${m.votosBueno||0}`, callback_data:`voto_bueno_${m.id}`, style:"success"},{text:`👎 Malo ${m.votosMalo||0}`, callback_data:`voto_malo_${m.id}`, style:"danger"}], [{text:"👈🏻 VOLVER", callback_data:"lista", style:"danger"},{text:"👑 INICIO", callback_data:"inicio", style:"danger"}]]; try{ await ctx.deleteMessage(); }catch(e){} if(media){ try{ await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} } await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); }catch(e){} });
bot.action('preview_start', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} let c=await getConfig(); let texto=replaceVars(c.bienvenida_texto||"Hola {mencion}",{},ctx); let media=c.bienvenida_media||c.bienvenida_media_file_id; try{ await ctx.deleteMessage(); }catch(e){} if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML'}); return; }catch(e){} } await ctx.reply(texto,{parse_mode:'HTML'}); });

module.exports = async(req,res)=>{
  if(req.method==='GET') return res.status(200).send('Bot OK - TODO + MODELOS POR BOTON');
  try{ await bot.handleUpdate(req.body); return res.status(200).send('ok'); }catch(e){ console.error(e); return res.status(200).send('ok'); }
};
