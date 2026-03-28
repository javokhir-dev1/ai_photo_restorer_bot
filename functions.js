import { GoogleGenAI } from "@google/genai";

import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

import * as fs from "node:fs";
import "dotenv/config"

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export async function downloadTelegramPhoto(ctx, manualFileId = null) {
    try {
        // Agar manualFileId berilgan bo'lsa shuni olamiz, aks holda xabardagi oxirgi rasmni
        const fileId = manualFileId || ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);

        const folderPath = path.join(__dirname, 'photos');
        const fileName = `photo_${Date.now()}.png`;
        const downloadPath = path.join(folderPath, fileName);

        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        const response = await axios({
            url: fileLink.href,
            method: 'GET',
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(downloadPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(fileName));
            writer.on('error', (err) => reject(err));
        });

    } catch (error) {
        throw new Error("Rasmni yuklab olishda xatolik: " + error.message);
    }
}
export async function processImage(imagePath, promptText, outputName = "output-image.png") {
  try {
    const ai = new GoogleGenAI({apiKey: process.env.TOKEN});

    // Rasmni o'qish va Base64 formatiga o'tkazish
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString("base64");

    const prompt = [
      { text: promptText },
      {
        inlineData: {
          mimeType: "image/png", 
          data: base64Image,
        },
      },
    ];
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: prompt,
    });
    for (const part of response.candidates[0].content.parts) {
      if (part.text) {
        console.log("AI izohi:", part.text);
      } else if (part.inlineData) {
        const generatedImageData = part.inlineData.data;
        const buffer = Buffer.from(generatedImageData, "base64");
        
        fs.writeFileSync(outputName, buffer);
        console.log(`Yangi rasm saqlandi: ${outputName}`);
      }
    }

    return { success: true, message: "Jarayon yakunlandi" };
  } catch (error) {
    console.error("Rasm bilan ishlashda xatolik:", error.message);
    return { success: false, error: error.message };
  }
}

export async function sendLocalPhoto(ctx, localPath, caption = '') {
  try {
    if (fs.existsSync(localPath)) {
      await ctx.replyWithPhoto(
        { source: localPath }, 
        { caption: caption }
      );
    } else {
      console.error('Fayl topilmadi:', localPath);
      await ctx.reply('Xatolik: Ko‘rsatilgan rasm fayli topilmadi.');
    }
  } catch (error) {
    console.error('Mahalliy rasmni yuborishda xatolik:', error);
    await ctx.reply('Rasmni yuborish jarayonida muammo yuz berdi.');
  }
}

import { Op } from "sequelize";
import { Channel } from "./models/channel.model.js"; // Model yo'lini to'g'rilang
import { UserImage } from "./models/UserImage.model.js";

export async function getMissingChannel(ctx) {
    const telegramId = ctx.from ? ctx.from.id : ctx.callback_query.from.id;
    
    // Kanallarni bazadan olish
    const channels = await Channel.findAll();
    if (channels.length === 0) return null;

    for (const channel of channels) {
        try {
            // MUHIM: kanal.telegram "@username" yoki "-100123456" ko'rinishida bo'lishi kerak
            const chatMember = await ctx.telegram.getChatMember(channel.telegram, telegramId);
            
            const isMember = ["member", "administrator", "creator"].includes(chatMember.status);

            if (!isMember) {
                return channel; // Obuna bo'lmagan birinchi kanalni qaytaradi
            }
        } catch (error) {
            // Agar bot kanalda admin bo'lmasa yoki kanal topilmasa shu yerga tushadi
            console.error(`Tekshirib bo'lmadi (${channel.telegram}):`, error.message);
            // Agar bot kanalda admin bo'lmasa, u doim xato beradi va foydalanuvchini "obuna bo'lmagan" deb o'ylaydi
        }
    }

    return null; 
}