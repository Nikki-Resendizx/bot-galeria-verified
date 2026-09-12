// --- NUEVO HELPER PARA EDITAR MISMO MENSAJE ---
async function editOrReply(ctx, media, texto, keyboard){
  try{
    if(ctx.callbackQuery && ctx.callbackQuery.message){
      let msg = ctx.callbackQuery.message;
      if(media){
        // Si el mensaje actual tiene foto, lo editamos
        if(msg.photo || msg.document){
          await ctx.editMessageMedia({type:'photo', media: media, caption: texto, parse_mode:'HTML'}, {reply_markup:{inline_keyboard:keyboard}}).catch(async()=>{
            // Si falla editar media, edita caption
            await ctx.editMessageCaption(texto, {parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
          });
          return true;
        }else{
          // Si es texto, lo convertimos a foto? Mejor borra y manda nuevo
          // Intentamos editar texto primero
          await ctx.deleteMessage().catch(()=>{});
        }
      }else{
        await ctx.editMessageText(texto, {parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
        return true;
      }
    }
  }catch(e){ console.log("edit falló, mando nuevo:", e.message) }
  // Fallback: manda nuevo
  if(media){
    try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}}); return; }catch(e){}
  }
  await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:keyboard}});
}

bot.start(async(ctx)=>{
  console.log("START", ctx.from.id);
  let c=await getConfig();
  let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑\nBienvenid@ a Galeria", {}, ctx);
  let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 ABRIR GALERÍA", type:"web_app", url:WEBAPP_URL, style:"success", row:0}, {text:"📋 VER LISTA", type:"callback", data:"lista", style:"primary", row:1}], {}, ctx);
  let media = c.bienvenida_media || c.bienvenida_media_file_id || c.bienvenida_media_url;
  if(media){ try{ await ctx.replyWithPhoto(media,{caption:texto, parse_mode:'HTML', reply_markup:{inline_keyboard:kb}}); return; }catch(e){} }
  await ctx.reply(texto,{parse_mode:'HTML', reply_markup:{inline_keyboard:kb}});
});

// >>> NUEVA GALERIA SOBRE MISMO MENSAJE + SOLO NOMBRE <<<
bot.action('lista', async(ctx)=>{
  await ctx.answerCbQuery();
  let c=await getConfig();
  let texto=replaceVars(c.galeria_texto||"👑 GALERIA {mencion}", {}, ctx);
  let snap=await getDocs(query(collection(db,"modelos"),orderBy("fecha","desc")));
  let keyboard=[]; let row=[]; let i=0; let emojiPremium=c.galeria_emoji_premium||"";
  snap.forEach(d=>{
    let m=d.data();
    // SOLO NOMBRE, sin @
    let style=["primary","success","danger"][i%3];
    let btn={text:`${m.perfil}`, callback_data:`ver_${d.id}`, style};
    if(emojiPremium) btn.icon_custom_emoji_id=emojiPremium;
    row.push(btn);
    if(row.length===2){keyboard.push(row);row=[];} // 2 por fila para que se vea bonito
    i++;
  });
  if(row.length>0) keyboard.push(row);
  keyboard.push([{text:"💖 ABRIR GALERÍA WEB", web_app:{url:WEBAPP_URL}, style:"success"}]);
  keyboard.push([{text:"🏠 Inicio", callback_data:"inicio", style:""}]);

  let media = c.galeria_media || c.galeria_media_file_id || c.galeria_media_url;
  await editOrReply(ctx, media, texto, keyboard);
});

bot.action('inicio', async(ctx)=>{
  await ctx.answerCbQuery();
  let c=await getConfig();
  let texto=replaceVars(c.bienvenida_texto||"Hola {mencion} 👑\nBienvenid@ a Galeria", {}, ctx);
  let kb=buildKeyboard(c.bienvenida_botones||[{text:"💖 ABRIR GALERÍA", type:"web_app", url:WEBAPP_URL, style:"success", row:0}, {text:"📋 VER LISTA", type:"callback", data:"lista", style:"primary", row:1}], {}, ctx);
  let media = c.bienvenida_media || c.bienvenida_media_file_id || c.bienvenida_media_url;
  await editOrReply(ctx, media, texto, kb);
});

// >>> MODELO TAMBIEN SOBRE MISMO MENSAJE <<<
bot.action(/ver_(.*)/, async(ctx)=>{
  await ctx.answerCbQuery();
  let snap=await getDoc(doc(db,"modelos",ctx.match[1])); if(!snap.exists()) return;
  let m={id:snap.id,...snap.data()}; let c=await getConfig();
  let caption=replaceVars(c.plantilla_texto||"👑 {perfil} 👑\nHola {mencion}", m, ctx);
  let kb=buildKeyboard(c.plantilla_botones||[{text:"💖 VER PERFIL", type:"web_app", url:WEBAPP_URL+"?m={id}", style:"primary", row:0}], m, ctx);
  // Agregamos botones de navegación abajo
  kb.push([{text:"⬅️ Volver a Galería", callback_data:"lista", style:"primary"}, {text:"🏠 Inicio", callback_data:"inicio", style:""}]);

  let media = m.foto || m.foto_url;
  await editOrReply(ctx, media, caption, kb);
});
