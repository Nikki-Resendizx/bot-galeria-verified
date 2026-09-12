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
function getMencion(ctx){ let n=(ctx.from.first_name||"").replace(/</g,'').replace(/>/g,''); return n? `<a href="tg://user?id=${ctx.from.id}">${n}</a>` : ""; }
function replaceVars(str, m={}, ctx=null){
  if(!str) return "";
  let total=(m.votosMalo||0)+(m.votosBueno||0);
  let pBueno=total?Math.round((m.votosBueno||0)/total*100):0;
  let lista=m.servicios?.map(s=>`• ${s}`).join('\n')||'• -';
  let mencion = ctx? getMencion(ctx) : "{mencion}";
  return str.replaceAll('{mencion}', mencion).replaceAll('{perfil}', m.perfil||'').replaceAll('{username}', m.username||'').replaceAll('{edad}', String(m.edad||'')).replaceAll('{nacionalidad}', m.nacionalidad||'').replaceAll('{servicios}', m.servicios?.join(' • ')||'-').replaceAll('{servicios_lista}', lista).replaceAll('{descripcion}', m.descripcion||'').replaceAll('{votos}', String(total)).replaceAll('{votosBueno}', String(m.votosBueno||0)).replaceAll('{votosMalo}', String(m.votosMalo||0)).replaceAll('{porcentajeBueno}', String(pBueno)).replaceAll('{id}', m.id||'').replaceAll('{canalFree}', m.canalFree||m.canal_free||'https://t.me/').replaceAll('{contacto}', m.contacto||`https://t.me/${m.username||''}`);
}
function textoConPremiumToHtml(txt, entities){
  if(!entities?.length) return txt;
  let res=txt; let ids=[];
  let customs=entities.filter(e=>e.type==='custom_emoji');
  [...customs].sort((a,b)=>b.offset-a.offset).forEach(e=>{
    let base=txt.substring(e.offset, e.offset+e.length);
    res=res.substring(0,e.offset)+`<tg-emoji emoji-id="${e.custom_emoji_id}">${base}</tg-emoji>`+res.substring(e.offset+e.length);
    ids.push(e.custom_emoji_id);
  });
  return {html:res, ids};
}
function getMediaModelo(m){ let c=[m.foto_file_id, m.foto, m.foto_url, m.fotoUrl, m.fotos?.[0]]; for(let x of c){ if(typeof x==='string' && x.length>10) return x.trim(); if(typeof x==='object' && x?.file_id) return x.file_id; } return null; }

let esperando={}; let plantillaTemp={};
const TEXTO_PANEL = `👑 <b>ⓅⒶⓃⒺⓁ ⒹⒺ ⒶⒹⓂⒾⓃ</b> 👑\n\n👋 BIENVENID@ AL PANEL\n\n💖 Que deseas hacer`;

bot.start(async(ctx)=>{
  try{
    const uid=String(ctx.from.id);
    try{ const u=await getDoc(doc(db,"usuarios", uid)); if(u.exists() && u.data().banned){ return ctx.reply("🚫 Estás baneado"); } }catch(e){}
    try{ await setDoc(doc(db,"usuarios", uid), {id:uid, first_name:ctx.from.first_name||"", username:ctx.from.username||""}, {merge:true}); }catch(e){}
    let c=await getConfig();
    let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑", {}, ctx);
    let kb=[[{text:"💖 𝗩𝗘𝗥 𝗚𝗔𝗟𝗘𝗥𝗜𝗔 𝗩𝗜𝗥𝗧𝗨𝗔𝗟 💖", web_app:{url:WEBAPP_URL}, style:"success"}], [{text:"👑 𝗩𝗘𝗥 𝗟𝗜𝗦𝗧𝗔 𝗗𝗘 𝗠𝗢𝗗𝗘𝗟𝗢𝗦 👑", callback_data:"lista", style:"primary"}]];
    let media=c.bienvenida_media||c.bienvenida_media_file_id;
    if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
    await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.log(e); }
});

bot.command('admin', async(ctx)=>{
  if(!(await isAdmin(ctx))) return ctx.reply("❌ No eres admin");
  delete esperando[String(ctx.from.id)];
  await ctx.reply(TEXTO_PANEL,{
    parse_mode:'HTML',
    reply_markup:{inline_keyboard:[
      [{text:"👋 BIENVENIDA", callback_data:"panel_bienvenida", style:"primary"}, {text:"💾 PLANTILLAS", callback_data:"panel_plantillas", style:"primary"}],
      [{text:"🖼️ GALERIA", callback_data:"panel_galeria", style:"success"}, {text:"💃 MODELOS", callback_data:"panel_modelos", style:"success"}],
      [{text:"👥 USUARIOS", callback_data:"panel_usuarios", style:"danger"}, {text:"👑 ADMINS", callback_data:"panel_admins", style:"danger"}]
    ]}
  });
});
bot.command('cancel', async(ctx)=>{ delete esperando[String(ctx.from.id)]; await ctx.reply("✅ Cancelado - /admin"); });

// COMANDOS DIRECTOS DE BAN/ADMIN
bot.command('ban', async(ctx)=>{ if(!(await isAdmin(ctx))) return; let id=ctx.message.text.split(' ')[1]; if(!id) return ctx.reply("Usa /ban ID"); await setDoc(doc(db,"usuarios",String(id)),{banned:true},{merge:true}); await ctx.reply(`🚫 Baneado ${id}`); });
bot.command('unban', async(ctx)=>{ if(!(await isAdmin(ctx))) return; let id=ctx.message.text.split(' ')[1]; if(!id) return ctx.reply("Usa /unban ID"); await setDoc(doc(db,"usuarios",String(id)),{banned:false},{merge:true}); await ctx.reply(`✅ Desbaneado ${id}`); });
bot.command('addadmin', async(ctx)=>{ if(!(await isAdmin(ctx))) return; let id=ctx.message.text.split(' ')[1]; if(!id) return ctx.reply("Usa /addadmin ID"); let c=await getConfig(); let admins=c.admins||[]; if(!admins.includes(String(id))) admins.push(String(id)); await setDoc(doc(db,"config","bot"),{admins},{merge:true}); await ctx.reply(`👑 Admin agregado ${id}`); });
bot.command('deladmin', async(ctx)=>{ if(!(await isAdmin(ctx))) return; let id=ctx.message.text.split(' ')[1]; if(!id) return ctx.reply("Usa /deladmin ID"); let c=await getConfig(); let admins=(c.admins||[]).filter(a=>a!==String(id)); await setDoc(doc(db,"config","bot"),{admins},{merge:true}); await ctx.reply(`🗑️ Admin eliminado ${id}`); });

// PANEL
bot.action('panel_bienvenida', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); let c=await getConfig(); await ctx.reply(`👋 <b>BIENVENIDA EDITOR</b>\nFoto: ${c.bienvenida_media?'✅':'❌'}\nTexto: ${(c.bienvenida_texto||'').substring(0,350)}\n\nVariables: {mencion}`,{parse_mode:'HTML', reply_markup:{inline_keyboard:[[{text:"📸 Cambiar FOTO", callback_data:"edit_bienvenida_foto", style:"primary"}, {text:"📝 Cambiar TEXTO", callback_data:"edit_bienvenida_texto", style:"primary"}], [{text:"🧩 Emoji Premium", callback_data:"edit_bienvenida_emoji", style:"success"}, {text:"👁️ Preview", callback_data:"preview_start", style:"success"}], [{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]]}}); });
bot.action('panel_galeria', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); let c=await getConfig(); await ctx.reply(`🖼️ <b>GALERIA EDITOR</b>\nFoto: ${c.galeria_media?'✅':'❌'}\nTexto: ${(c.galeria_texto||'').substring(0,350)}`,{parse_mode:'HTML', reply_markup:{inline_keyboard:[[{text:"📸 Foto", callback_data:"edit_galeria_foto", style:"primary"}, {text:"📝 Texto", callback_data:"edit_galeria_texto", style:"primary"}], [{text:"🧩 Emoji", callback_data:"edit_galeria_emoji", style:"success"}], [{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]]}}); });
bot.action('panel_plantillas', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); let c=await getConfig(); let snap=await getDocs(collection(db,"plantillas")).catch(()=>({docs:[]})); let kb=[]; snap.docs.slice(0,10).forEach(d=>{ kb.push([{text:`📄 ${d.data().nombre}`, callback_data:`plantilla_use_${d.id}`, style:"primary"}, {text:"🗑️", callback_data:`plantilla_del_${d.id}`, style:"danger"}]); }); kb.push([{text:"➕ CREAR NUEVA", callback_data:"edit_plantilla_texto", style:"success"}]); kb.push([{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]); await ctx.reply(`💾 <b>PLANTILLAS</b>\nActiva: ${(c.plantilla_texto||'').substring(0,500)}\n\nVariables: {mencion} {perfil} {servicios_lista} {votos} {votosBueno} {votosMalo} {canalFree} {contacto}`,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); });

// MODELOS
bot.action('panel_modelos', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); let snap; try{ snap=await getDocs(query(collection(db,"modelos"),orderBy("fecha","desc"))); }catch{ snap=await getDocs(collection(db,"modelos")); } let kb=[]; let row=[]; snap.forEach(d=>{ let m=d.data(); let has=getMediaModelo(m)?"📸":"❌"; row.push({text:`${has} ${m.perfil||d.id}`, callback_data:`mfoto_${d.id}`, style: has==="📸"?"success":"danger"}); if(row.length===2){ kb.push(row); row=[]; } }); if(row.length) kb.push(row); kb.push([{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]); await ctx.reply(`💃 MODELOS (${snap.size}) - toca para cambiar foto`,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); });
bot.action(/mfoto_(.*)/, async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); if(!(await isAdmin(ctx))) return; let id=ctx.match[1]; esperando[String(ctx.from.id)]=`foto_modelo_${id}`; await ctx.reply(`📸 Manda foto para ${id} ahora\n/cancel para salir`); });

// USUARIOS CON ID Y BOTONES BAN
bot.action('panel_usuarios', async(ctx)=>{
  await ctx.answerCbQuery().catch(()=>{});
  let snap=await getDocs(collection(db,"usuarios")).catch(()=>({docs:[]}));
  let kb=[];
  snap.docs.slice(0,15).forEach(d=>{
    let u=d.data(); let banned=u.banned?"🚫":"✅";
    kb.push([
      {text:`${banned} ${u.first_name||'Sin nombre'} | ${d.id}`, callback_data:`user_ver_${d.id}`, style: u.banned?"danger":"success"},
      {text: u.banned?"✅ Unban":"🚫 Ban", callback_data: u.banned?`user_unban_${d.id}`:`user_ban_${d.id}`, style: u.banned?"success":"danger"}
    ]);
  });
  kb.push([{text:"⬅️ Volver", callback_data:"back_admin", style:"primary"}]);
  await ctx.reply(`👥 <b>USUARIOS (${snap.size})</b>\nToca para banear/desbanear\nFormato: Nombre | ID`,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});
bot.action(/user_ban_(.*)/, async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); if(!(await isAdmin(ctx))) return; let id=ctx.match[1]; await setDoc(doc(db,"usuarios",String(id)),{banned:true},{merge:true}); await ctx.answerCbQuery("Baneado"); await ctx.reply(`🚫 Usuario ${id} baneado`); });
bot.action(/user_unban_(.*)/, async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); if(!(await isAdmin(ctx))) return; let id=ctx.match[1]; await setDoc(doc(db,"usuarios",String(id)),{banned:false},{merge:true}); await ctx.answerCbQuery("Desbaneado"); await ctx.reply(`✅ Usuario ${id} desbaneado`); });
bot.action(/user_ver_(.*)/, async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); let id=ctx.match[1]; let s=await getDoc(doc(db,"usuarios",String(id))); if(!s.exists()) return ctx.reply("No existe"); let u=s.data(); await ctx.reply(`👤 <b>USUARIO</b>\nID: <code>${id}</code>\nNombre: ${u.first_name||''}\nUsername: @${u.username||'-'}\nBaneado: ${u.banned?'SI 🚫':'NO ✅'}`,{parse_mode:'HTML', reply_markup:{inline_keyboard:[[{text:u.banned?"✅ DESBANEAR":"🚫 BANEAR", callback_data:u.banned?`user_unban_${id}`:`user_ban_${id}`, style:u.banned?"success":"danger"}], [{text:"⬅️ Volver", callback_data:"panel_usuarios", style:"primary"}]]}}); });

// ADMINS CON ID Y BOTONES
bot.action('panel_admins', async(ctx)=>{
  await ctx.answerCbQuery().catch(()=>{});
  let c=await getConfig(); let admins=c.admins||[];
  let kb=[];
  admins.forEach(id=>{
    kb.push([{text:`👑 ${id}`, callback_data:`admin_ver_${id}`, style:"primary"}, {text:"🗑️ Quitar", callback_data:`admin_del_${id}`, style:"danger"}]);
  });
  if(ADMIN_IDS_ENV.length) kb.push([{text:`🔒 ENV: ${ADMIN_IDS_ENV.join(',')}`, callback_data:"noop", style:"primary"}]);
  kb.push([{text:"➕ Agregar Admin", callback_data:"admin_add", style:"success"}]);
  kb.push([{text:"⬅️ Volver", callback_data:"back_admin", style:"danger"}]);
  await ctx.reply(`👑 <b>ADMINS (${admins.length})</b>\nToca para eliminar\n\nUsa el botón para agregar nuevo`,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});
bot.action('admin_add', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); esperando[String(ctx.from.id)]='add_admin_id'; await ctx.reply("👑 Manda el ID del nuevo admin (solo números)\nEj: 123456789\n/cancel para salir"); });
bot.action(/admin_del_(.*)/, async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); if(!(await isAdmin(ctx))) return; let id=ctx.match[1]; let c=await getConfig(); let admins=(c.admins||[]).filter(a=>a!==String(id)); await setDoc(doc(db,"config","bot"),{admins},{merge:true}); await ctx.answerCbQuery("Eliminado"); await ctx.reply(`🗑️ Admin ${id} eliminado`); });
bot.action(/admin_ver_(.*)/, async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); let id=ctx.match[1]; await ctx.reply(`👑 Admin ID: <code>${id}</code>`,{parse_mode:'HTML', reply_markup:{inline_keyboard:[[{text:"🗑️ Quitar Admin", callback_data:`admin_del_${id}`, style:"danger"}], [{text:"⬅️ Volver", callback_data:"panel_admins", style:"primary"}]]}}); });

bot.action('edit_bienvenida_foto', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); esperando[String(ctx.from.id)]='foto_bienvenida'; await ctx.reply("📸 Manda FOTO de bienvenida AHORA"); });
bot.action('edit_bienvenida_texto', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); esperando[String(ctx.from.id)]='texto_bienvenida'; await ctx.reply("📝 Manda TEXTO bienvenida con {mencion}\n/cancel salir"); });
bot.action('edit_bienvenida_emoji', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); esperando[String(ctx.from.id)]='emoji_bienvenida'; await ctx.reply("🧩 Manda emoji PREMIUM"); });
bot.action('edit_galeria_foto', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); esperando[String(ctx.from.id)]='foto_galeria'; await ctx.reply("📸 Manda FOTO galeria"); });
bot.action('edit_galeria_texto', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); esperando[String(ctx.from.id)]='texto_galeria'; await ctx.reply("📝 Manda TEXTO galeria con {mencion}"); });
bot.action('edit_galeria_emoji', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); esperando[String(ctx.from.id)]='emoji_galeria'; await ctx.reply("🧩 Manda emoji PREMIUM galeria"); });
bot.action('edit_plantilla_texto', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); esperando[String(ctx.from.id)]='texto_plantilla'; await ctx.reply("📝 Manda PLANTILLA con variables\n{perfil} {servicios_lista} {votos} {canalFree} {contacto} {mencion}"); });

bot.action(/plantilla_use_(.*)/, async(ctx)=>{ if(!(await isAdmin(ctx))) return; let s=await getDoc(doc(db,"plantillas",ctx.match[1])); if(!s.exists()) return ctx.answerCbQuery("No existe"); await setDoc(doc(db,"config","bot"),{plantilla_texto:s.data().texto},{merge:true}); await ctx.answerCbQuery("✅ Activada"); await ctx.reply("✅ Plantilla activada"); });
bot.action(/plantilla_del_(.*)/, async(ctx)=>{ if(!(await isAdmin(ctx))) return; await deleteDoc(doc(db,"plantillas",ctx.match[1])); await ctx.answerCbQuery("Eliminada"); });
bot.action('back_admin', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); try{ await ctx.deleteMessage(); }catch(e){} await bot.telegram.sendMessage(ctx.from.id, TEXTO_PANEL, {parse_mode:'HTML', reply_markup:{inline_keyboard:[[{text:"👋 BIENVENIDA", callback_data:"panel_bienvenida", style:"primary"}, {text:"💾 PLANTILLAS", callback_data:"panel_plantillas", style:"primary"}], [{text:"🖼️ GALERIA", callback_data:"panel_galeria", style:"success"}, {text:"💃 MODELOS", callback_data:"panel_modelos", style:"success"}], [{text:"👥 USUARIOS", callback_data:"panel_usuarios", style:"danger"}, {text:"👑 ADMINS", callback_data:"panel_admins", style:"danger"}]]}}); });
bot.action('preview_start', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); let c=await getConfig(); let texto=replaceVars(c.bienvenida_texto||"Hola {mencion}",{},ctx); let media=c.bienvenida_media; if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML'}); return; }catch(e){} } await ctx.reply(texto,{parse_mode:'HTML'}); });

// HANDLERS FOTO Y TEXTO - ARREGLADOS CON STRING()
bot.on('photo', async(ctx)=>{
  if(!(await isAdmin(ctx))) return;
  let key=String(ctx.from.id); let st=esperando[key]; if(!st) return;
  let fileId=ctx.message.photo[ctx.message.photo.length-1].file_id;
  if(st.startsWith('foto_modelo_')){ let id=st.replace('foto_modelo_',''); await setDoc(doc(db,"modelos",id),{foto_file_id:fileId, foto:fileId},{merge:true}); delete esperando[key]; return ctx.reply(`✅ Foto modelo ${id} 📸 guardada`); }
  if(st==='foto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_media:fileId, bienvenida_media_file_id:fileId},{merge:true}); delete esperando[key]; return ctx.reply("✅ BIENVENIDA foto guardada - haz /start para ver"); }
  if(st==='foto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_media:fileId, galeria_media_file_id:fileId},{merge:true}); delete esperando[key]; return ctx.reply("✅ GALERIA foto guardada"); }
});

bot.on('text', async(ctx)=>{
  let txt=ctx.message.text; if(txt.startsWith('/')) return;
  if(!(await isAdmin(ctx))) return;
  let key=String(ctx.from.id); let st=esperando[key]; if(!st) return;
  let conv=textoConPremiumToHtml(txt, ctx.message.entities||[]);
  let htmlText=typeof conv==='object'?conv.html:txt;
  let first=typeof conv==='object'? (conv.ids[0]||"") : "";

  if(st==='texto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_texto:htmlText},{merge:true}); delete esperando[key]; return ctx.reply("✅ BIENVENIDA texto guardado - /admin > Preview"); }
  if(st==='emoji_bienvenida'){ if(!first) return ctx.reply("❌ Manda emoji PREMIUM"); await setDoc(doc(db,"config","bot"),{bienvenida_emoji_premium:first},{merge:true}); delete esperando[key]; return ctx.reply(`✅ Emoji: ${first}`); }
  if(st==='texto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_texto:htmlText},{merge:true}); delete esperando[key]; return ctx.reply("✅ GALERIA texto guardado"); }
  if(st==='emoji_galeria'){ if(!first) return ctx.reply("❌ Manda emoji PREMIUM"); await setDoc(doc(db,"config","bot"),{galeria_emoji_premium:first},{merge:true}); delete esperando[key]; return ctx.reply(`✅ Emoji galeria: ${first}`); }
  if(st==='texto_plantilla'){ plantillaTemp[key]={texto:htmlText}; esperando[key]='nombre_plantilla'; return ctx.reply("Ahora manda NOMBRE de plantilla"); }
  if(st==='nombre_plantilla'){ let temp=plantillaTemp[key]; let nombre=txt.slice(0,40); let newId=Date.now().toString(); await setDoc(doc(db,"plantillas",newId),{nombre, texto:temp.texto, fecha:new Date().toISOString()}); await setDoc(doc(db,"config","bot"),{plantilla_texto:temp.texto},{merge:true}); delete esperando[key]; delete plantillaTemp[key]; return ctx.reply(`✅ Plantilla "${nombre}" creada y activada`); }
  if(st==='add_admin_id'){ let id=txt.replace(/\D/g,''); if(!id) return ctx.reply("ID invalido, solo números"); let c=await getConfig(); let admins=c.admins||[]; if(!admins.includes(id)) admins.push(id); await setDoc(doc(db,"config","bot"),{admins},{merge:true}); delete esperando[key]; return ctx.reply(`👑 Admin ${id} agregado`); }
});

// RESTO LISTA Y PERFILES CON BOTONES COMPLETOS
bot.action('lista', async(ctx)=>{
  await ctx.answerCbQuery().catch(()=>{});
  let c=await getConfig(); let texto=replaceVars(c.galeria_texto||"👑 GALERIA {mencion}", {}, ctx);
  let snap; try{ snap=await getDocs(query(collection(db,"modelos"),orderBy("fecha","desc"))); }catch{ snap=await getDocs(collection(db,"modelos")); }
  let kb=[]; let row=[];
  snap.forEach(d=>{ let m=d.data(); let btn={text:(m.perfil||d.id).replace(/@/g,'').trim(), callback_data:`ver_${d.id}`, style: row.length===0? "primary":"danger"}; let emoji=c.galeria_emoji_premium; if(emoji) btn.icon_custom_emoji_id=String(emoji); row.push(btn); if(row.length===2){ kb.push(row); row=[]; } });
  if(row.length) kb.push(row); kb.push([{text:"𝗩𝗘𝗥 𝗚𝗔𝗟𝗘𝗥𝗜𝗔 𝗩𝗜𝗥𝗧𝗨𝗔𝗟 💖", web_app:{url:WEBAPP_URL}, style:"success"}]);
  let media=c.galeria_media||c.galeria_media_file_id; try{ await ctx.deleteMessage(); }catch(e){}
  if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
  await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});
bot.action(/ver_(.*)/, async(ctx)=>{
  await ctx.answerCbQuery().catch(()=>{});
  let id=ctx.match[1].trim(); let snap=await getDoc(doc(db,"modelos",id)); if(!snap.exists()) return ctx.reply("❌ No existe");
  let m={id:snap.id,...snap.data()}; let c=await getConfig();
  let caption=replaceVars(c.plantilla_texto||"👑 {perfil} 👑\nHola {mencion}\nVotos: {votos}\n{servicios_lista}", m, ctx);
  let media=getMediaModelo(m); let canalFree=m.canalFree||"https://t.me/"; let contacto=m.contacto||`https://t.me/${m.username||''}`;
  let emoji=c.galeria_emoji_premium||""; let eObj=emoji?{icon_custom_emoji_id:String(emoji)}:{};
  let kb=[
    [{text:"💖 𝗩𝗘𝗥 𝗣𝗘𝗥𝗙𝗜𝗟 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗢 💖", web_app:{url:`${WEBAPP_URL}?m=${m.id}`}, style:"success",...eObj}],
    [{text:`👍 𝐁𝐮𝐞𝐧𝐨 ${m.votosBueno||0}`, callback_data:`voto_bueno_${m.id}`, style:"success"}, {text:`👎 𝐌𝐚𝐥𝐨 ${m.votosMalo||0}`, callback_data:`voto_malo_${m.id}`, style:"danger"}],
    [{text:"💎 𝗖𝗔𝗡𝗔𝗟 𝗙𝗥𝗘𝗘", url:canalFree, style:"primary"}, {text:"💬 𝗖𝗢𝗡𝗧𝗔𝗖𝗧𝗔𝗥", url:contacto, style:"primary"}],
    [{text:"👈🏻 VOLVER", callback_data:"lista", style:"danger"}, {text:"👑 INICIO", callback_data:"inicio", style:"danger"}]
  ];
  try{ await ctx.deleteMessage(); }catch(e){}
  if(media){ try{ await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
  await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});
bot.action('inicio', async(ctx)=>{ await ctx.answerCbQuery().catch(()=>{}); let c=await getConfig(); let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑", {}, ctx); let kb=[[{text:"💖 GALERÍA", web_app:{url:WEBAPP_URL}, style:"success"}], [{text:"📋 LISTA", callback_data:"lista", style:"primary"}]]; let media=c.bienvenida_media; try{ await ctx.deleteMessage(); }catch(e){} if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} } await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); });
bot.action(/voto_(bueno|malo)_(.*)/, async(ctx)=>{ await ctx.answerCbQuery("✅").catch(()=>{}); let tipo=ctx.match[1]; let id=ctx.match[2]; let ref=doc(db,"modelos",id); if(tipo==='bueno') await updateDoc(ref,{votosBueno:increment(1)}).catch(async()=>{ await setDoc(ref,{votosBueno:1},{merge:true}); }); else await updateDoc(ref,{votosMalo:increment(1)}).catch(async()=>{ await setDoc(ref,{votosMalo:1},{merge:true}); }); let snap=await getDoc(ref); let m={id:snap.id,...snap.data()}; let c=await getConfig(); let caption=replaceVars(c.plantilla_texto||"👑 {perfil}", m, ctx); let media=getMediaModelo(m); let kb=[[{text:`👍 𝐁𝐮𝐞𝐧𝐨 ${m.votosBueno||0}`, callback_data:`voto_bueno_${m.id}`, style:"success"}, {text:`👎 𝐌𝐚𝐥𝐨 ${m.votosMalo||0}`, callback_data:`voto_malo_${m.id}`, style:"danger"}], [{text:"👈🏻 VOLVER", callback_data:"lista", style:"danger"}]]; try{ await ctx.deleteMessage(); }catch(e){} if(media){ try{ await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} } await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); });

module.exports = async(req,res)=>{
  if(req.method==='GET') return res.status(200).send('Bot OK FIX TOTAL');
  try{ await bot.handleUpdate(req.body); return res.status(200).send('ok'); }catch(e){ return res.status(200).send('ok'); }
};
