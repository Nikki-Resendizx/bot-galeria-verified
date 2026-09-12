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
  return str.replaceAll('{mencion}', mencion).replaceAll('{perfil}', m.perfil||'').replaceAll('{username}', m.username||'').replaceAll('{edad}', m.edad||'').replaceAll('{nacionalidad}', m.nacionalidad||'').replaceAll('{servicios}', m.servicios?.join(' • ')||'-').replaceAll('{servicios_lista}', lista).replaceAll('{descripcion}', m.descripcion||'').replaceAll('{votos}', total).replaceAll('{porcentajeBueno}', pBueno).replaceAll('{porcentajeMalo}', 100-pBueno).replaceAll('{id}', m.id||'').replaceAll('{canalFree}', m.canalFree||'https://t.me/').replaceAll('{contacto}', m.contacto||`https://t.me/${m.username||''}`);
}
function buildKeyboard(btnsDef, modelo={}, ctx=null){
  let rowsMap={};
  btnsDef.forEach(b=>{
    let text=replaceVars(b.text, modelo, ctx);
    let btn={text};
    if(b.style) btn.style=b.style;
    if(b.icon_custom_emoji_id) btn.icon_custom_emoji_id=String(b.icon_custom_emoji_id);
    if(b.type==='web_app') btn.web_app={url: replaceVars(b.url||"", modelo, ctx)};
    else if(b.type==='url') btn.url=replaceVars(b.url||"", modelo, ctx);
    else btn.callback_data=replaceVars(b.data||"", modelo, ctx);
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
function getMediaModelo(m){
  let cands = [m.foto, m.foto_file_id, m.foto_url, m.fotoUrl, m.image, m.imagen, m.url, m.foto_principal, (m.fotos && m.fotos[0])];
  for(let c of cands){
    if(!c) continue;
    if(typeof c==='string' && c.length>10) return c;
    if(typeof c==='object' && c.file_id) return c.file_id;
    if(typeof c==='object' && c.url) return c.url;
  }
  return null;
}
let esperando={}; let plantillaTemp={};

bot.start(async(ctx)=>{
  try{
    // REGISTRO + CHECK BAN
    let uid = String(ctx.from.id);
    let uDoc = await getDoc(doc(db,"usuarios", uid)).catch(()=>null);
    if(uDoc && uDoc.exists() && uDoc.data().banned){ return ctx.reply("🚫 Estás baneado del bot"); }
    await setDoc(doc(db,"usuarios", uid), {id: uid, first_name: ctx.from.first_name||"", username: ctx.from.username||"", fecha: new Date().toISOString(), last_start: Date.now(), banned: false}, {merge:true});
    let c=await getConfig();
    let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑\nBienvenid@ a Galeria", {}, ctx);
    let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 𝗩𝗘𝗥 𝗚𝗔𝗟𝗘𝗥𝗜𝗔 𝗩𝗜𝗥𝗧𝗨𝗔𝗟 💖", type:"web_app", url:WEBAPP_URL, style:"success", row:0, icon_custom_emoji_id: c.bienvenida_emoji_premium||c.galeria_emoji_premium||""},{text:"👑 𝗩𝗘𝗥 𝗟𝗜𝗦𝗧𝗔 𝗗𝗘 𝗠𝗢𝗗𝗘𝗟𝗢𝗦 👑", type:"callback", data:"lista", style:"primary", row:1, icon_custom_emoji_id: c.bienvenida_emoji_premium||c.galeria_emoji_premium||""}], {}, ctx);
    let media = c.bienvenida_media || c.bienvenida_media_file_id || c.bienvenida_media_url;
    if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){ console.log("bienvenida foto error", e.message)} }
    await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.error("START ERROR", e); }
});

bot.command('cancel', async(ctx)=>{ delete esperando[ctx.from.id]; delete plantillaTemp[ctx.from.id]; await ctx.reply("✅ Cancelado - /admin"); });
bot.command('addadmin', async(ctx)=>{ if(!(await isAdmin(ctx))) return; let newId=ctx.message.text.split(' ')[1]; if(!newId) return ctx.reply("Usa: /addadmin 123456"); let c=await getConfig(); let admins=c.admins||[]; if(!admins.includes(newId)) admins.push(String(newId)); await setDoc(doc(db,"config","bot"),{admins},{merge:true}); await ctx.reply(`✅ Admin ${newId} agregado`); });
bot.command('deladmin', async(ctx)=>{ if(!(await isAdmin(ctx))) return; let delId=ctx.message.text.split(' ')[1]; let c=await getConfig(); let admins=(c.admins||[]).filter(x=>x!==String(delId)); await setDoc(doc(db,"config","bot"),{admins},{merge:true}); await ctx.reply(`✅ Admin ${delId} eliminado`); });
bot.command('admins', async(ctx)=>{ if(!(await isAdmin(ctx))) return; let c=await getConfig(); await ctx.reply(`ENV: ${ADMIN_IDS_ENV.join(',')}\nFirestore: ${(c.admins||[]).join(',')}`); });
bot.command('ban', async(ctx)=>{ if(!(await isAdmin(ctx))) return; let banId=ctx.message.text.split(' ')[1]; if(!banId) return ctx.reply("Usa: /ban 123456"); await setDoc(doc(db,"usuarios", String(banId)), {banned:true, banned_at: new Date().toISOString()}, {merge:true}); await ctx.reply(`🚫 Usuario ${banId} baneado`); });
bot.command('unban', async(ctx)=>{ if(!(await isAdmin(ctx))) return; let banId=ctx.message.text.split(' ')[1]; if(!banId) return ctx.reply("Usa: /unban 123456"); await setDoc(doc(db,"usuarios", String(banId)), {banned:false}, {merge:true}); await ctx.reply(`✅ Usuario ${banId} desbaneado`); });
bot.command('banned', async(ctx)=>{ if(!(await isAdmin(ctx))) return; let snap=await getDocs(collection(db,"usuarios")); let list=[]; snap.forEach(d=>{ if(d.data().banned) list.push(d.id); }); await ctx.reply(`Baneados: ${list.join(', ')||'ninguno'}`); });

bot.command('setfoto', async(ctx)=>{
  if(!(await isAdmin(ctx))) return;
  let id = ctx.message.text.split(' ')[1];
  if(!id) return ctx.reply("Usa:\n/setfoto ID_DE_MODELO\nRespondiendo a una FOTO");
  let reply = ctx.message.reply_to_message;
  if(!reply ||!reply.photo) return ctx.reply(`Manda una foto y responde a esa foto con:\n/setfoto ${id}`);
  let fileId = reply.photo[reply.photo.length-1].file_id;
  await setDoc(doc(db,"modelos",id),{foto_file_id:fileId, foto:fileId, foto_url:fileId},{merge:true});
  await ctx.reply(`✅ Foto guardada para ${id} con file_id`);
});

bot.command('admin', async(ctx)=>{
  if(!(await isAdmin(ctx))) return ctx.reply("❌ No eres admin");
  delete esperando[ctx.from.id];
  await ctx.reply(`👑 <b>𝗣𝗔𝗡𝗘𝗟 𝗗𝗘 𝗔𝗗𝗠𝗜𝗡𝗦</b> 👑\n/ban /unban /addadmin /cancel`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[
    [{text:"👋🏻 𝗕𝗜𝗘𝗡𝗩𝗘𝗡𝗜𝗗𝗔", callback_data:"panel_bienvenida", style:"primary"}, {text:"🖼️ 𝙂𝘼𝙇𝙀𝙍𝙄𝘼", callback_data:"panel_galeria", style:"primary"}],
    [{text:"👤 𝙐𝙎𝙐𝘼𝙍𝙄𝙊𝙎", callback_data:"panel_usuarios", style:"danger"}, {text:"📝 𝙋𝙇𝘼𝙉𝙏𝙄𝙇𝙇𝘼𝙎", callback_data:"panel_plantillas", style:"danger"}],
    [{text:"👑 ADMINS/BAN", callback_data:"panel_admins", style:"primary"}],
    [{text:"🌐 𝘼𝘿𝙈𝙄𝙉 𝙋𝘼𝙉𝙀𝙇 𝙒𝙀𝘽", web_app:{url:"https://bot-galeria-verified.vercel.app/admin.html"}, style:"success"}]
  ]}});
});

bot.action('panel_bienvenida', async(ctx)=>{ await ctx.answerCbQuery(); let c=await getConfig(); await ctx.reply(`Foto: ${c.bienvenida_media?'✅':'❌'}\nEmoji btn: ${c.bienvenida_emoji_premium||c.galeria_emoji_premium||'no'}\nTexto: ${(c.bienvenida_texto||'').substring(0,300)}`,{reply_markup:{inline_keyboard:[[{text:"📸 Foto", callback_data:"edit_bienvenida_foto"}, {text:"📝 Texto", callback_data:"edit_bienvenida_texto"}], [{text:"🧩 Emoji premium botones", callback_data:"edit_bienvenida_emoji"}], [{text:"👁️ Preview", callback_data:"preview_start"}], [{text:"⬅️ Volver", callback_data:"back_panel"}]]}}); });
bot.action('panel_galeria', async(ctx)=>{ await ctx.answerCbQuery(); let c=await getConfig(); await ctx.reply(`Foto: ${c.galeria_media?'✅':'❌'}\nEmoji: ${c.galeria_emoji_premium||'no'}`,{reply_markup:{inline_keyboard:[[{text:"📸 Foto", callback_data:"edit_galeria_foto"}, {text:"📝 Texto", callback_data:"edit_galeria_texto"}], [{text:"🧩 Emoji premium", callback_data:"edit_galeria_emoji"}], [{text:"⬅️ Volver", callback_data:"back_panel"}]]}}); });
bot.action('panel_usuarios', async(ctx)=>{ await ctx.answerCbQuery(); let snap=await getDocs(collection(db,"usuarios")).catch(()=>({size:0})); let c=await getConfig(); await ctx.reply(`👤 Usuarios: ${snap.size}\nAdmins: ${(c.admins||[]).join(', ')}\n\nComandos:\n/ban ID\n/unban ID\n/banned\n/addadmin ID\n/deladmin ID`,{reply_markup:{inline_keyboard:[[{text:"⬅️ Volver", callback_data:"back_panel"}]]}}); });
bot.action('panel_admins', async(ctx)=>{ await ctx.answerCbQuery(); let c=await getConfig(); await ctx.reply(`👑 Admins: ${(c.admins||[]).join(', ')}\n\nManda ID para agregar admin, o usa:\n/addadmin ID\n/deladmin ID\n/ban ID\n/unban ID`); esperando[ctx.from.id]='add_admin'; });
bot.action('panel_plantillas', async(ctx)=>{
  await ctx.answerCbQuery(); let c=await getConfig(); let snap=await getDocs(collection(db,"plantillas")).catch(()=>({docs:[]}));
  let kb=[]; snap.docs.slice(0,12).forEach(d=>{ let p=d.data(); kb.push([{text:`📄 ${p.nombre||d.id.slice(-6)}`, callback_data:`plantilla_use_${d.id}`}, {text:"🗑️", callback_data:`plantilla_del_${d.id}`}]); });
  kb.push([{text:"📝 Nueva Plantilla (desde bot)", callback_data:"edit_plantilla_texto", style:"success"}]); kb.push([{text:"⬅️ Volver", callback_data:"back_panel"}]);
  await ctx.reply(`📝 ACTUAL:\n${(c.plantilla_texto||'').substring(0,400)}\n\nGuardadas: ${snap.docs.length}`,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});
bot.action(/plantilla_use_(.*)/, async(ctx)=>{ if(!(await isAdmin(ctx))) return; let id=ctx.match[1]; let snap=await getDoc(doc(db,"plantillas",id)); if(!snap.exists()) return ctx.answerCbQuery("No existe"); let p=snap.data(); await setDoc(doc(db,"config","bot"),{plantilla_texto:p.texto, plantilla_premium_ids:p.premium_ids||[], plantilla_premium_log:p.premium_log||[]},{merge:true}); await ctx.answerCbQuery("✅ Activada"); await ctx.reply(`✅ Activada: ${p.nombre}`); });
bot.action(/plantilla_del_(.*)/, async(ctx)=>{ if(!(await isAdmin(ctx))) return; await deleteDoc(doc(db,"plantillas",ctx.match[1])); await ctx.answerCbQuery("Eliminada"); await ctx.reply("🗑️ Eliminada"); });
bot.action('back_panel', async(ctx)=>{ await ctx.answerCbQuery(); return bot.telegram.sendMessage(ctx.from.id,"/admin"); });
bot.action('edit_bienvenida_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_bienvenida'; await ctx.reply("📸 Manda la FOTO como FOTO (no como archivo)"); });
bot.action('edit_bienvenida_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_bienvenida'; await ctx.reply("📝 Manda texto con {mencion} + emoji premium\nEj: Hola {mencion} <emoji>"); });
bot.action('edit_bienvenida_emoji', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='emoji_bienvenida'; await ctx.reply("🧩 Manda UN emoji premium para botones de BIENVENIDA\nMándalo solo y te diré su ID"); });
bot.action('edit_galeria_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_galeria'; await ctx.reply("📸 Manda foto GALERÍA como FOTO"); });
bot.action('edit_galeria_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_galeria'; await ctx.reply("📝 Manda texto galería {mencion} + premium"); });
bot.action('edit_galeria_emoji', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='emoji_galeria'; await ctx.reply("🧩 Manda UN emoji premium para botones de GALERÍA y PERFILES"); });
bot.action('edit_plantilla_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_plantilla'; await ctx.reply("📝 Manda PLANTILLA con {mencion} {perfil} {servicios_lista} + premium\nLuego te pido NOMBRE y se guarda en plantillas/{id}"); });

bot.on(['photo','document'], async(ctx, next)=>{
  if(!(await isAdmin(ctx))) return next?next():null;
  let fileId = ctx.message.photo? ctx.message.photo[ctx.message.photo.length-1].file_id : ctx.message.document.file_id;
  let st=esperando[ctx.from.id];
  if(st==='foto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_media:fileId, bienvenida_media_file_id:fileId, bienvenida_media_url:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto bienvenida guardada (file_id) - baja 100%"); }
  if(st==='foto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_media:fileId, galeria_media_file_id:fileId, galeria_media_url:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto galería guardada"); }
  if(next) return next();
});

bot.on('message', async(ctx, next)=>{
  let ents=ctx.message.entities||[]; let custom=ents.find(e=>e.type==='custom_emoji');
  if(custom && await isAdmin(ctx)){
    let st=esperando[ctx.from.id];
    if(st==='emoji_galeria' || st==='emoji_bienvenida' || st==='add_admin'){
      // lo maneja el handler de texto
    } else {
      let txt=ctx.message.text||""; let base=txt.substring(custom.offset, custom.offset+custom.length);
      await ctx.reply(`🧩 Premium detectado:\nID: <code>${custom.custom_emoji_id}</code>\nChar: ${base}\n\nCópialo para botones`,{parse_mode:'HTML'});
    }
  }
  if(next) await next();
});

bot.on('text', async(ctx, next)=>{
  let txt=ctx.message.text; if(txt.startsWith('/')) { if(next) return next(); else return; }
  if(!(await isAdmin(ctx))) { if(next) return next(); else return; }
  let st=esperando[ctx.from.id]; if(!st) { if(next) return next(); else return; }
  let conv=textoConPremiumToHtml(txt, ctx.message.entities||[]); let htmlText=typeof conv==='object'?conv.html:conv; let premiumIds=typeof conv==='object'?conv.ids:[]; let premiumLog=typeof conv==='object'?conv.log:[]; let first=premiumIds[0]||"";
  if(st==='add_admin'){ let id=txt.trim(); if(!/^\d+$/.test(id)) { if(next) return next(); else return; } let c=await getConfig(); let admins=c.admins||[]; if(!admins.includes(id)) admins.push(id); await setDoc(doc(db,"config","bot"),{admins},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Admin ${id} agregado`); }
  if(st==='texto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_texto:htmlText, bienvenida_premium_ids:premiumIds, bienvenida_premium_log:premiumLog},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Bienvenida guardada con ${premiumIds.length} premium`); }
  if(st==='emoji_bienvenida'){ let id=first||txt.trim(); await setDoc(doc(db,"config","bot"),{bienvenida_emoji_premium:String(id), galeria_emoji_premium:String(id)},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Emoji premium botones bienvenida: ${id}`); }
  if(st==='texto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_texto:htmlText, galeria_premium_ids:premiumIds, galeria_premium_log:premiumLog},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Galería guardada`); }
  if(st==='emoji_galeria'){ let id=first||txt.trim(); await setDoc(doc(db,"config","bot"),{galeria_emoji_premium:String(id), bienvenida_emoji_premium:String(id)},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Emoji premium botones galería/perfiles: ${id}`); }
  if(st==='texto_plantilla'){ plantillaTemp[ctx.from.id]={texto:htmlText, premium_ids:premiumIds, premium_log:premiumLog}; esperando[ctx.from.id]='nombre_plantilla'; return ctx.reply(`✅ Plantilla recibida (${htmlText.length} chars)\nAhora manda el NOMBRE para guardarla\nEj: "Plantilla Sexy Rosa"`); }
  if(st==='nombre_plantilla'){ let temp=plantillaTemp[ctx.from.id]; if(!temp) { delete esperando[ctx.from.id]; return ctx.reply("Error, manda /admin > Plantillas de nuevo"); } let nombre=txt.trim().substring(0,50); let newId=Date.now().toString(); await setDoc(doc(db,"plantillas",newId),{nombre, texto:temp.texto, premium_ids:temp.premium_ids, premium_log:temp.premium_log, fecha: new Date().toISOString(), creado_por: String(ctx.from.id)}); await setDoc(doc(db,"config","bot"),{plantilla_texto:temp.texto, plantilla_premium_ids:temp.premium_ids, plantilla_premium_log:temp.premium_log},{merge:true}); delete esperando[ctx.from.id]; delete plantillaTemp[ctx.from.id]; return ctx.reply(`✅ Plantilla "${nombre}" guardada como ${newId} y ACTIVADA\nPuedes crear infinitas: /admin > Plantillas > Nueva`); }
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
      let btn={text:nombre, callback_data:`ver_${d.id}`, style:(idx%2===0)?"primary":"danger"};
      if(c.galeria_emoji_premium) btn.icon_custom_emoji_id=String(c.galeria_emoji_premium);
      if(c.bienvenida_emoji_premium) btn.icon_custom_emoji_id=String(c.bienvenida_emoji_premium||c.galeria_emoji_premium);
      row.push(btn); idx++;
      if(row.length===2){ keyboard.push(row); row=[]; }
    });
    if(row.length>0) keyboard.push(row);
    let mainEmoji = c.bienvenida_emoji_premium||c.galeria_emoji_premium||"";
    keyboard.push([{text:"𝗩𝗘𝗥 𝗚𝗔𝗟𝗘𝗥𝗜𝗔 𝗩𝗜𝗥𝗧𝗨𝗔𝗟 💖", web_app:{url:WEBAPP_URL}, style:"success",...(mainEmoji?{icon_custom_emoji_id:mainEmoji}:{})}]);
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
    let emojiBtn = c.galeria_emoji_premium || c.bienvenida_emoji_premium || "";
    let emojiObj = emojiBtn?{icon_custom_emoji_id:String(emojiBtn)}:{};
    let kb=[
      [{text:"💖 𝗩𝗘𝗥 𝗣𝗘𝗥𝗙𝗜𝗟 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗢 💖", web_app:{url:`${WEBAPP_URL}?m=${m.id}`}, style:"primary",...emojiObj}],
      [{text:`👍 Bueno ${m.votosBueno||0}`, callback_data:`voto_bueno_${m.id}`, style:"success",...emojiObj}, {text
