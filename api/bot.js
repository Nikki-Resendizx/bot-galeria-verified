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
  return `<a href="tg://user?id=${ctx.from.id}">${name}</a>`;
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

// START SIEMPRE PRIMERO - NO LO TOQUES
bot.start(async(ctx)=>{
  try{
    console.log("START RECIBIDO", ctx.from.id);
    let c=await getConfig();
    let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑\nBienvenid@ a Galeria", {}, ctx);
    let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 ABRIR GALERÍA", type:"web_app", url:WEBAPP_URL, style:"success", row:0},{text:"📋 VER LISTA", type:"callback", data:"lista", style:"primary", row:1}], {}, ctx);
    let media = c.bienvenida_media || c.bienvenida_media_file_id || c.bienvenida_media_url;
    if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){ console.log("foto fail", e.message)} }
    await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
  }catch(e){ console.error("START ERROR", e); try{ await ctx.reply("Hola 👑 bienvenid@"); }catch(e){} }
});

bot.command('admin', async(ctx)=>{
  if(!isAdmin(ctx)) return ctx.reply("❌ No eres admin");
  await ctx.reply(`👑 <b>PANEL DE ADMIN</b> 👑`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[
    [{text:"🟢 BIENVENIDA", callback_data:"panel_bienvenida", style:"success"}, {text:"🔵 GALERÍA", callback_data:"panel_galeria", style:"primary"}],
    [{text:"🔵 USUARIOS", callback_data:"panel_usuarios", style:"primary"}, {text:"🔴 PLANTILLAS", callback_data:"panel_plantillas", style:"danger"}],
    [{text:"🌐 PANEL WEB", web_app:{url:"https://bot-galeria-verified.vercel.app/admin.html"}, style:"primary"}]
  ]}});
});

bot.action('panel_bienvenida', async(ctx)=>{ await ctx.answerCbQuery(); let c=await getConfig(); await ctx.reply(`Foto: ${c.bienvenida_media?'✅':'❌'}\nTexto: ${(c.bienvenida_texto||'').substring(0,300)}`,{reply_markup:{inline_keyboard:[[{text:"📸 Foto", callback_data:"edit_bienvenida_foto"}, {text:"📝 Texto {mencion}", callback_data:"edit_bienvenida_texto"}],[{text:"⬅️", callback_data:"back_panel"}]]}}); });
bot.action('panel_galeria', async(ctx)=>{ await ctx.answerCbQuery(); let c=await getConfig(); await ctx.reply(`Foto: ${c.galeria_media?'✅':'❌'}\nEmoji: ${c.galeria_emoji_premium||'no'}`,{reply_markup:{inline_keyboard:[[{text:"📸 Foto", callback_data:"edit_galeria_foto"}, {text:"📝 Texto", callback_data:"edit_galeria_texto"}],[{text:"🧩 Emoji", callback_data:"edit_galeria_emoji"}],[{text:"⬅️", callback_data:"back_panel"}]]}}); });
bot.action('panel_usuarios', async(ctx)=>{ await ctx.answerCbQuery(); let snap=await getDocs(collection(db,"usuarios")).catch(()=>({size:0})); await ctx.reply(`Usuarios: ${snap.size}`); });
bot.action('panel_plantillas', async(ctx)=>{ await ctx.answerCbQuery(); let c=await getConfig(); await ctx.reply(`${(c.plantilla_texto||'').substring(0,400)}`,{reply_markup:{inline_keyboard:[[{text:"📝 Editar", callback_data:"edit_plantilla_texto"}]]}}); });
bot.action('back_panel', async(ctx)=>{ await ctx.answerCbQuery(); await ctx.reply("/admin"); });
bot.action('edit_bienvenida_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_bienvenida'; await ctx.reply("📸 Manda FOTO"); });
bot.action('edit_bienvenida_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_bienvenida'; await ctx.reply("📝 Manda texto {mencion} opcional"); });
bot.action('edit_galeria_foto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='foto_galeria'; await ctx.reply("📸 Manda foto GALERÍA"); });
bot.action('edit_galeria_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_galeria'; await ctx.reply("📝 Manda texto galería"); });
bot.action('edit_galeria_emoji', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='emoji_galeria'; await ctx.reply("🧩 Manda emoji premium"); });
bot.action('edit_plantilla_texto', async(ctx)=>{ await ctx.answerCbQuery(); esperando[ctx.from.id]='texto_plantilla'; await ctx.reply("📝 Manda plantilla"); });

bot.on(['photo','document'], async(ctx, next)=>{
  if(!isAdmin(ctx)) return next? next():null;
  let fileId = ctx.message.photo? ctx.message.photo[ctx.message.photo.length-1].file_id : ctx.message.document.file_id;
  let st=esperando[ctx.from.id];
  if(st==='foto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_media:fileId, bienvenida_media_file_id:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto bienvenida guardada"); }
  if(st==='foto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_media:fileId, galeria_media_file_id:fileId},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Foto galería guardada"); }
  if(next) return next();
});

bot.on('text', async(ctx, next)=>{
  let txt=ctx.message.text; if(txt.startsWith('/')) return next? next():null;
  if(!isAdmin(ctx)) return next? next():null;
  let st=esperando[ctx.from.id]; if(!st) return next? next():null;
  let ent=ctx.message.entities||[];
  if(st==='texto_bienvenida'){ await setDoc(doc(db,"config","bot"),{bienvenida_texto:txt},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Guardado"); }
  if(st==='texto_galeria'){ await setDoc(doc(db,"config","bot"),{galeria_texto:txt},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Guardado"); }
  if(st==='emoji_galeria'){ let id=txt; for(let e of ent){ if(e.type==='custom_emoji') id=e.custom_emoji_id; } await setDoc(doc(db,"config","bot"),{galeria_emoji_premium:id},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Emoji guardado"); }
  if(st==='texto_plantilla'){ await setDoc(doc(db,"config","bot"),{plantilla_texto:txt},{merge:true}); delete esperando[ctx.from.id]; return ctx.reply("✅ Plantilla guardada"); }
});

// NAVEGACION EN MISMO MENSAJE
bot.action('lista', async(ctx)=>{
  try{
    await ctx.answerCbQuery();
    let c=await getConfig();
    let texto=replaceVars(c.galeria_texto||"👑 GALERIA {mencion}", {}, ctx);
    let snap=await getDocs(query(collection(db,"modelos"),orderBy("fecha","desc")));
    let keyboard=[]; let row=[]; let i=0; let emojiPremium=c.galeria_emoji_premium||"";
    snap.forEach(d=>{
      let m=d.data();
      let btn={text: `${m.perfil}`, callback_data:`ver_${d.id}`, style:["primary","success","danger"][i%3]}; // SOLO NOMBRE
      if(emojiPremium) btn.icon_custom_emoji_id=emojiPremium;
      row.push(btn);
      if(row.length===2){ keyboard.push(row); row=[]; }
      i++;
    });
    if(row.length>0) keyboard.push(row);
    keyboard.push([{text:"💖 ABRIR GALERÍA WEB", web_app:{url:WEBAPP_URL}, style:"success"}]);
    keyboard.push([{text:"🏠 Inicio", callback_data:"inicio"}]);
    let media = c.galeria_media || c.galeria_media_file_id || c.galeria_media_url;
    if(media){
      await ctx.editMessageMedia({type:'photo', media:media, caption:texto, parse_mode:'HTML'}, {reply_markup:{inline_keyboard:keyboard}}).catch(async()=>{
        await ctx.editMessageCaption(texto, {parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}}).catch(async()=>{
          try{ await ctx.deleteMessage(); }catch(e){}
          await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
        });
      });
    }else{
      await ctx.editMessageText(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
    }
  }catch(e){ console.error("lista error", e); }
});

bot.action('inicio', async(ctx)=>{
  try{
    await ctx.answerCbQuery();
    let c=await getConfig();
    let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑", {}, ctx);
    let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 ABRIR GALERÍA", type:"web_app", url:WEBAPP_URL, style:"success", row:0},{text:"📋 VER LISTA", type:"callback", data:"lista", style:"primary", row:1}], {}, ctx);
    let media = c.bienvenida_media || c.bienvenida_media_file_id || c.bienvenida_media_url;
    if(media){
      await ctx.editMessageMedia({type:'photo', media:media, caption:texto, parse_mode:'HTML'}, {reply_markup:{inline_keyboard:kb}}).catch(async()=>{
        await ctx.editMessageCaption(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}).catch(async()=>{
          try{ await ctx.deleteMessage(); }catch(e){}
          await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
        });
      });
    }else{
      await ctx.editMessageText(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
    }
  }catch(e){ console.error("inicio error", e); }
});

bot.action(/ver_(.*)/, async(ctx)=>{
  try{
    await ctx.answerCbQuery();
    let snap=await getDoc(doc(db,"modelos",ctx.match[1])); if(!snap.exists()) return;
    let m={id:snap.id,...snap.data()}; let c=await getConfig();
    let caption=replaceVars(c.plantilla_texto||"👑 {perfil} 👑\nHola {mencion}", m, ctx);
    let kb=buildKeyboard(c.plantilla_botones||[{text:"💖 VER", type:"web_app", url:WEBAPP_URL+"?m={id}", style:"primary", row:0}], m, ctx);
    kb.push([{text:"⬅️ Volver", callback_data:"lista", style:"primary"}, {text:"🏠 Inicio", callback_data:"inicio"}]);
    let media = m.foto || m.foto_url || m.foto_file_id;
    if(media){
      await ctx.editMessageMedia({type:'photo', media:media, caption:caption, parse_mode:'HTML'}, {reply_markup:{inline_keyboard:kb}}).catch(async()=>{
        await ctx.editMessageCaption(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}).catch(async()=>{
          try{ await ctx.deleteMessage(); }catch(e){}
          try{ await ctx.replyWithPhoto(media,{caption, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); }catch(e){ await ctx.reply(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); }
        });
      });
    }else{
      await ctx.editMessageText(caption,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
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
  if(req.method==='GET') return res.status(200).send('Bot OK - MISMO MENSAJE + solo nombre');
  try{ await bot.handleUpdate(req.body); return res.status(200).send('ok'); }catch(e){ console.error(e); return res.status(200).send('ok'); }
};
