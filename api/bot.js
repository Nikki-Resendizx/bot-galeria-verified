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
function buildKeyboard(btnsDef, modelo={}, ctx=null){
  let rowsMap={};
  if(!Array.isArray(btnsDef)) btnsDef=[];
  btnsDef.forEach(b=>{
    let text=replaceVars(b.text||"BOTON", modelo, ctx);
    let btn={text};
    if(b.icon_custom_emoji_id) btn.icon_custom_emoji_id=String(b.icon_custom_emoji_id);
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
  return {html: res, ids: premiumLog.map(p=>p.id), log: premiumLog};
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

bot.start(async(ctx)=>{
  try{
    const uid=String(ctx.from.id);
    try{ const u=await getDoc(doc(db,"usuarios", uid)); if(u.exists() && u.data().banned) return ctx.reply("🚫 Estás baneado"); }catch(e){}
    try{ await setDoc(doc(db,"usuarios", uid), {id:uid, first_name:ctx.from.first_name||"", username:ctx.from.username||"", fecha:new Date().toISOString(), last_start:Date.now(), banned:false}, {merge:true}); }catch(e){}
    let c=await getConfig();
    let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑\nBienvenid@ a Galeria", {}, ctx);
    let emoji=c.bienvenida_emoji_premium||c.galeria_emoji_premium||"";
    let kb=buildKeyboard(c.bienvenida_botones||[
      {text:"💖 𝗩𝗘𝗥 𝗚𝗔𝗟𝗘𝗥𝗜𝗔 𝗩𝗜𝗥𝗧𝗨𝗔𝗟 💖", type:"web_app", url:WEBAPP_URL, row:0, icon_custom_emoji_id:emoji},
      {text:"👑 𝗩𝗘𝗥 𝗟𝗜𝗦𝗧𝗔 𝗗𝗘 𝗠𝗢𝗗𝗘𝗟𝗢𝗦 👑", type:"callback", data:"lista", row:1, icon_custom_emoji_id:emoji}
    ], {}, ctx);
    let media=c.bienvenida_media||c.bienvenida_media_file_id||c.bienvenida_media_url;
    if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
    await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.error("START", e); await ctx.reply("Hola 👑",{reply_markup:{inline_keyboard:[[{text:"💖 GALERIA", web_app:{url:WEBAPP_URL}}]]}}); }
});

bot.command('cancel', async(ctx)=>{ delete esperando[ctx.from.id]; delete plantillaTemp[ctx.from.id]; await ctx.reply("✅ Cancelado"); });
bot.command('addadmin', async(ctx)=>{ if(!(await isAdmin(ctx))) return; let id=ctx.message.text.split(' ')[1]; if(!id) return ctx.reply("Usa /addadmin ID"); let c=await getConfig(); let a=c.admins||[]; if(!a.includes(String(id))) a.push(String(id)); await setDoc(doc(db,"config","bot"),{admins:a},{merge:true}); await ctx.reply(`✅ Admin ${id} agregado`); });
bot.command('deladmin', async(ctx)=>{ if(!(await isAdmin(ctx))) return; let id=ctx.message.text.split(' ')[1]; let c=await getConfig(); let a=(c.admins||[]).filter(x=>x!==String(id)); await setDoc(doc(db,"config","bot"),{admins:a},{merge:true}); await ctx.reply(`✅ Admin ${id} eliminado`); });
bot.command('admins', async(ctx)=>{ if(!(await isAdmin(ctx))) return; let c=await getConfig(); await ctx.reply(`ENV: ${ADMIN_IDS_ENV.join(',')}\nFirestore: ${(c.admins||[]).join(',')}`); });
bot.command('ban', async(ctx)=>{ if(!(await isAdmin(ctx))) return; let id=ctx.message.text.split(' ')[1]; if(!id) return ctx.reply("Usa /ban ID"); await setDoc(doc(db,"usuarios", String(id)),{banned:true},{merge:true}); await ctx.reply(`🚫 Baneado ${id}`); });
bot.command('unban', async(ctx)=>{ if(!(await isAdmin(ctx))) return; let id=ctx.message.text.split(' ')[1]; await setDoc(doc(db,"usuarios", String(id)),{banned:false},{merge:true}); await ctx.reply(`✅ Desbaneado ${id}`); });
bot.command('banned', async(ctx)=>{ if(!(await isAdmin(ctx))) return; let snap=await getDocs(collection(db,"usuarios")); let list=[]; snap.forEach(d=>{ if(d.data().banned) list.push(d.id); }); await ctx.reply(`Baneados: ${list.join(', ')||'ninguno'}`); });

bot.command('setfoto', async(ctx)=>{
  if(!(await isAdmin(ctx))) return;
  let args = ctx.message.text.split(' ');
  let id = args[1];
  if(!id) return ctx.reply("Usa:\n/setfoto ID_DE_MODELO\nY responde a una FOTO con ese comando\n\n1. Manda la foto de la modelo\n2. Responde a esa foto con /setfoto ID");
  let reply = ctx.message.reply_to_message;
  if(!reply ||!reply.photo) return ctx.reply(`Responde a la FOTO con:\n/setfoto ${id}`);
  let fileId = reply.photo[reply.photo.length-1].file_id;
  await setDoc(doc(db,"modelos",id),{foto_file_id:fileId, foto:fileId, foto_url:fileId},{merge:true});
  await ctx.reply(`✅ Foto guardada para modelo ${id}\nYa aparece en lista`);
});

bot.command('admin', async(ctx)=>{
  if(!(await isAdmin(ctx))) return ctx.reply("❌ No eres admin");
  await ctx.reply(`👑 𝗣𝗔𝗡𝗘𝗟 𝗗𝗘 𝗔𝗗𝗠𝗜𝗡𝗦`,{reply_markup:{inline_keyboard:[
    [{text:"👋🏻 𝗕𝗜𝗘𝗡𝗩𝗘𝗡𝗜𝗗𝗔", callback_data:"panel_bienvenida"}, {text:"🖼️ 𝙂𝘼𝙇𝙀𝙍𝙄𝘼", callback_data:"panel_galeria"}],
    [{text:"👤 𝙐𝙎𝙐𝘼𝙍𝙄𝙊𝙎", callback_data:"panel_usuarios"}, {text:"📝 𝙋𝙇𝘼𝙉𝙏𝙄𝙇𝙇𝘼𝙎", callback_data:"panel_plantillas"}],
    [{text:"🌐 𝘼𝘿𝙈𝙄𝙉 𝙒𝙀𝘽", web_app:{url:"https://bot-galeria-verified.vercel.app/admin.html"}}]
  ]}});
});

bot.action('panel_bienvenida', async(ctx)=>{
  try{ await ctx.answerCbQuery(); }catch(e){}
  let c=await getConfig();
  await ctx.reply(`BIENVENIDA\nFoto: ${c.bienvenida_media?'✅':'❌'}\nEmoji: ${c.bienvenida_emoji_premium||'no'}\nTexto: ${(c.bienvenida_texto||'vacio').substring(0,350)}`,{
    reply_markup:{inline_keyboard:[
      [{text:"📸 Cambiar Foto", callback_data:"edit_bienvenida_foto"}, {text:"📝 Texto", callback_data:"edit_bienvenida_texto"}],
      [{text:"🧩 Emoji premium botones", callback_data:"edit_bienvenida_emoji"}],
      [{text:"👁️ Preview /start", callback_data:"preview_start"}],
      [{text:"⬅️ Volver", callback_data:"back_panel"}]
    ]}
  });
});
bot.action('panel_galeria', async(ctx)=>{
  try{ await ctx.answerCbQuery(); }catch(e){}
  let c=await getConfig();
  await ctx.reply(`GALERIA\nFoto: ${c.galeria_media?'✅':'❌'}\nEmoji: ${c.galeria_emoji_premium||'no'}\nTexto: ${(c.galeria_texto||'').substring(0,300)}`,{
    reply_markup:{inline_keyboard:[
      [{text:"📸 Foto", callback_data:"edit_galeria_foto"}, {text:"📝 Texto", callback_data:"edit_galeria_texto"}],
      [{text:"🧩 Emoji premium", callback_data:"edit_galeria_emoji"}],
      [{text:"⬅️ Volver", callback_data:"back_panel"}]
    ]}
  });
});
bot.action('panel_usuarios', async(ctx)=>{
  try{ await ctx.answerCbQuery(); }catch(e){}
  let snap=await getDocs(collection(db,"usuarios")).catch(()=>({size:0}));
  let c=await getConfig();
  await ctx.reply(`Usuarios: ${snap.size}\nAdmins: ${(c.admins||[]).join(', ')}\n\n/ban ID\n/unban ID\n/banned\n/addadmin ID`,{
    reply_markup:{inline_keyboard:[[{text:"⬅️ Volver", callback_data:"back_panel"}]]}
  });
});
bot.action('panel_admins', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} let c=await getConfig(); await ctx.reply(`Admins: ${(c.admins||[]).join(', ')}\n/addadmin ID\n/deladmin ID`); });
bot.action('panel_plantillas', async(ctx)=>{
  try{ await ctx.answerCbQuery(); }catch(e){}
  let c=await getConfig();
  let snap=await getDocs(collection(db,"plantillas")).catch(()=>({docs:[]}));
  let kb=[];
  snap.docs.slice(0,10).forEach(d=>{
    kb.push([{text:`📄 ${d.data().nombre||d.id.slice(-6)}`, callback_data:`plantilla_use_${d.id}`}, {text:"🗑️", callback_data:`plantilla_del_${d.id}`}]);
  });
  kb.push([{text:"📝 Nueva desde bot", callback_data:"edit_plantilla_texto"}]);
  kb.push([{text:"⬅️ Volver", callback_data:"back_panel"}]);
  await ctx.reply(`Plantilla actual:\n${(c.plantilla_texto||'').substring(0,350)}\n\nGuardadas: ${snap.docs.length}`,{reply_markup:{inline_keyboard:kb}});
});

bot.action(/plantilla_use_(.*)/, async(ctx)=>{ if(!(await isAdmin(ctx))) return; let id=ctx.match[1]; let s=await getDoc(doc(db,"plantillas",id)); if(!s.exists()) return ctx.answerCbQuery("No existe"); await setDoc(doc(db,"config","bot"),{plantilla_texto:s.data().texto},{merge:true}); await ctx.answerCbQuery("✅ Activada"); await ctx.reply(`✅ Activada ${s.data().nombre}`); });
bot.action(/plantilla_del_(.*)/, async(ctx)=>{ if(!(await isAdmin(ctx))) return; await deleteDoc(doc(db,"plantillas",ctx.match[1])); await ctx.answerCbQuery("Eliminada"); await ctx.reply("🗑️ Eliminada"); });
bot.action('back_panel', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} await ctx.reply("/admin"); });

bot.action('edit_bienvenida_foto', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} esperando[ctx.from.id]='foto_bienvenida'; await ctx.reply("📸 Manda FOTO como FOTO"); });
bot.action('edit_bienvenida_texto', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} esperando[ctx.from.id]='texto_bienvenida'; await ctx.reply("📝 Manda texto {mencion} + premium"); });
bot.action('edit_bienvenida_emoji', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} esperando[ctx.from.id]='emoji_bienvenida'; await ctx.reply("🧩 Manda UN emoji premium para botones BIENVENIDA y GALERIA"); });
bot.action('edit_galeria_foto', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} esperando[ctx.from.id]='foto_galeria'; await ctx.reply("📸 Manda foto GALERIA"); });
bot.action('edit_galeria_texto', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} esperando[ctx.from.id]='texto_galeria'; await ctx.reply("📝 Manda texto galeria {mencion}"); });
bot.action('edit_galeria_emoji', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} esperando[ctx.from.id]='emoji_galeria'; await ctx.reply("🧩 Manda UN emoji premium para botones PERFIL"); });
bot.action('edit_plantilla_texto', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} esperando[ctx.from.id]='texto_plantilla'; await ctx.reply("📝 Manda plantilla con {mencion} {perfil} {servicios_lista} + premium\nLuego te pido NOMBRE"); });

bot.on(['photo'], async(ctx)=>{
  if(!(await isAdmin(ctx))) return;
  let fileId=ctx.message.photo[ctx.message.photo.length-1].file_id;
  let st=esperando[ctx.from.id];
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
  if(st==='emoji_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_emoji_premium:String(first), galeria_emoji_premium:String(first)},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Emoji botones: ${first}`); }
  if(st==='texto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_texto:htmlText},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Galeria guardada"); }
  if(st==='emoji_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_emoji_premium:String(first)},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply(`✅ Emoji perfil: ${first}`); }
  if(st==='texto_plantilla'){ plantillaTemp[ctx.from.id]={texto:htmlText, premium_ids:premiumIds}; esperando[ctx.from.id]='nombre_plantilla'; return ctx.reply("Ahora manda el NOMBRE de la plantilla\nEj: Plantilla Rosa 1"); }
  if(st==='nombre_plantilla'){ let temp=plantillaTemp[ctx.from.id]; let nombre=txt.trim().slice(0,40); let newId=Date.now().toString(); await setDoc(doc(db,"plantillas",newId),{nombre, texto:temp.texto, premium_ids:temp.premium_ids, fecha:new Date().toISOString()}); await setDoc(doc(db,"config","bot"),{plantilla_texto:temp.texto},{merge:true}); delete esperando[ctx.from.id]; delete plantillaTemp[ctx.from.id]; return ctx.reply(`✅ Plantilla "${nombre}" guardada y activada`); }
});

bot.action('lista', async(ctx)=>{
  try{ try{ await ctx.answerCbQuery(); }catch(e){} let c=await getConfig(); let texto=replaceVars(c.galeria_texto||"👑 GALERIA {mencion}", {}, ctx); let snap; try{ snap=await getDocs(query(collection(db,"modelos"),orderBy("fecha","desc"))); }catch{ snap=await getDocs(collection(db,"modelos")); } let keyboard=[]; let row=[]; snap.forEach(d=>{ let m=d.data(); let nombre=(m.perfil||d.id).replace(/@/g,'').trim(); let btn={text:nombre, callback_data:`ver_${d.id}`}; let emoji=c.galeria_emoji_premium||c.bienvenida_emoji_premium; if(emoji) btn.icon_custom_emoji_id=String(emoji); row.push(btn); if(row.length===2){ keyboard.push(row); row=[]; } }); if(row.length>0) keyboard.push(row); let emojiMain=c.galeria_emoji_premium||c.bienvenida_emoji_premium||""; let galBtn={text:"𝗩𝗘𝗥 𝗚𝗔𝗟𝗘𝗥𝗜𝗔 𝗩𝗜𝗥𝗧𝗨𝗔𝗟 💖", web_app:{url:WEBAPP_URL}}; if(emojiMain) galBtn.icon_custom_emoji_id=String(emojiMain); keyboard.push([galBtn]); let media=c.galeria_media||c.galeria_media_file_id; try{ await ctx.deleteMessage(); }catch(e){} if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}}); return; }catch(e){} } await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}}); }catch(e){ console.error("lista", e); }
});

bot.action(/ver_(.*)/, async(ctx)=>{
  try{ await ctx.answerCbQuery(); }catch(e){}
  try{
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
      [{text:"💖 𝗩𝗘𝗥 𝗣𝗘𝗥𝗙𝗜𝗟 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗢 💖", web_app:{url:`${WEBAPP_URL}?m=${m.id}`},...eObj}],
      [{text:`👍 Bueno ${m.votosBueno||0}`, callback_data:`voto_bueno_${m.id}`}, {text:`👎 Malo ${m.votosMalo||0}`, callback_data:`voto_malo_${m.id}`}],
      [{text:"💎 𝗖𝗔𝗡𝗔𝗟 𝗙𝗥𝗘𝗘", url:canalFree}, {text:"💬 𝗖𝗢𝗡𝗧𝗔𝗖𝗧𝗔𝗥", url:contacto}],
      [{text:"👈🏻 VOLVER", callback_data:"lista"}, {text:"👑 INICIO", callback_data:"inicio"}]
    ];
    let media=getMediaModelo(m);
    try{ await ctx.deleteMessage(); }catch(e){}
    if(media){
      try{ await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){}
      try{ await ctx.replyWithPhoto({url: media},{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){}
    }
    await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.error("ver_", e); }
});

bot.action('inicio', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} let c=await getConfig(); let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑", {}, ctx); let emoji=c.bienvenida_emoji_premium||""; let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 ABRIR GALERÍA", type:"web_app", url:WEBAPP_URL, row:0, icon_custom_emoji_id:emoji},{text:"📋 VER LISTA", type:"callback", data:"lista", row:1, icon_custom_emoji_id:emoji}], {}, ctx); let media=c.bienvenida_media||c.bienvenida_media_file_id; try{ await ctx.deleteMessage(); }catch(e){} if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} } await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); });
bot.action(/voto_(bueno|malo)_(.*)/, async(ctx)=>{ try{ await ctx.answerCbQuery("✅"); let tipo=ctx.match[1]; let id=ctx.match[2]; let ref=doc(db,"modelos",id); if(tipo==='bueno') await updateDoc(ref,{votosBueno:increment(1)}).catch(async()=>{ await setDoc(ref,{votosBueno:1},{merge:true}); }); else await updateDoc(ref,{votosMalo:increment(1)}).catch(async()=>{ await setDoc(ref,{votosMalo:1},{merge:true}); }); let snap=await getDoc(ref); let m={id:snap.id,...snap.data()}; let c=await getConfig(); let caption=replaceVars(c.plantilla_texto||"👑 {perfil} Votos {votos}", m, ctx); let media=getMediaModelo(m); let kb=[[{text:`👍 Bueno ${m.votosBueno||0}`, callback_data:`voto_bueno_${m.id}`},{text:`👎 Malo ${m.votosMalo||0}`, callback_data:`voto_malo_${m.id}`}], [{text:"👈🏻 VOLVER", callback_data:"lista"},{text:"👑 INICIO", callback_data:"inicio"}]]; try{ await ctx.deleteMessage(); }catch(e){} if(media){ try{ await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} } await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); }catch(e){} });
bot.action('preview_start', async(ctx)=>{ try{ await ctx.answerCbQuery(); }catch(e){} let c=await getConfig(); let texto=replaceVars(c.bienvenida_texto||"Hola {mencion}",{},ctx); let media=c.bienvenida_media||c.bienvenida_media_file_id; try{ await ctx.deleteMessage(); }catch(e){} if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML'}); return; }catch(e){} } await ctx.reply(texto,{parse_mode:'HTML'}); });

module.exports = async(req,res)=>{
  if(req.method==='GET') return res.status(200).send('Bot OK - FIX STORAGE LLENO + SETFOTO');
  try{ await bot.handleUpdate(req.body); return res.status(200).send('ok'); }catch(e){ console.error(e); return res.status(200).send('ok'); }
};
