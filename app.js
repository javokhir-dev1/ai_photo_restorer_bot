import { bot } from "./bot.js";
import { v4 as uuid } from "uuid";
import path from "path";
import { downloadTelegramPhoto, processImage, sendLocalPhoto } from "./functions.js";
import { User } from "./models/users.model.js";
import { UserImage } from "./models/UserImage.model.js";
import * as fs from "node:fs";
import { Markup } from "telegraf";
import { Photo } from "./models/photo.model.js";
import { Referral } from "./models/referal.model.js";
import { Op } from "sequelize";

const MESSAGES = {
    welcome: "Salom! Men rasmlaringizni qayta tiklovchi AI botman. 📸\n\nIstalgan eski yoki sifatsiz rasmni yuboring, men uni professional darajada yaxshilab beraman. ✨",
    loading: "📥 Rasm qabul qilindi. Yuklanmoqda...",
    processing: "⚙️ AI ishlov bermoqda... Bu biroz vaqt olishi mumkin.",
    sending: "📤 Tayyor! Rasm yuborilmoqda...",
    success: "Mana, rasmingiz yangi hayotga qaytdi! 🎨",
    error: "❌ Kechirasiz, texnik nosozlik yuz berdi. Iltimos, birozdan so'ng qayta urinib ko'ring.",
    noPhoto: "Iltimos, rasm formatidagi fayl yuboring. 👇"
};

// --- YORDAMCHI FUNKSIYALAR ---

const checkSubscription = async (userId) => {
    try {
        const member = await bot.telegram.getChatMember(process.env.CHANNEL_ID, userId);
        return ["member", "administrator", "creator"].includes(member.status);
    } catch (error) {
        console.error("Obunani tekshirishda xatolik:", error);
        return false;
    }
};

const getReferralStats = async (userId) => {
    const today = new Date().setHours(0, 0, 0, 0);
    
    // Bugun yopilgan referallar sonini sanaymiz
    const completedToday = await Referral.count({
        where: {
            owner_id: userId,
            status: 'completed',
            updatedAt: { [Op.gte]: today }
        }
    });

    // Hozirda kutib turgan referalni tekshirish
    const pendingRef = await Referral.findOne({
        where: { owner_id: userId, status: 'pending' }
    });

    return pendingRef ? pendingRef.target_count : (completedToday + 1);
};

// --- ASOSIY ISHLOV BERISH FUNKSIYASI ---

const handlePhotoRestoration = async (ctx, isPro, manualFileId = null) => {
    let loadingMsg;
    let photoPath = null;
    let restoredPhotoPath = null;

    try {
        const userId = ctx.from.id;
        const user = await User.findOne({ where: { telegram_id: userId } });
        if (!user) return ctx.reply("Iltimos, avval /start bosing.");

        // --- 1. KUNLIK LIMITNI YANGILASH (FAQAT YANGI KUN BO'LSA) ---
        const todayStr = new Date().toISOString().split('T')[0];
        const lastResetStr = user.last_reset ? new Date(user.last_reset).toISOString().split('T')[0] : null;

        if (lastResetStr !== todayStr) {
            user.daily_limit = 1; 
            user.last_reset = new Date();
            await user.save();
        }

        // --- 2. LIMIT TEKSHIRUVI ---
        if (user.daily_limit <= 0) {
            // A) Obuna tekshiruvi
            const isSubscribed = await checkSubscription(userId);
            if (!isSubscribed) {
                const photoRecord = await Photo.findOne({ where: { file_id: manualFileId } });
                const photoIdSuffix = photoRecord ? `:${photoRecord.id}` : "";

                return ctx.reply(
                    "Bugun uchun bepul limitingiz tugadi. ✨\nDavom etish uchun kanalimizga obuna bo'ling:",
                    Markup.inlineKeyboard([
                        [Markup.button.url("Kanalga a'zo bo'lish 📢", `https://t.me/${process.env.CHANNEL_ID.replace('@', '')}`)],
                        [Markup.button.callback("✅ Tekshirish", `check_sub${photoIdSuffix}`)]
                    ])
                );
            }

            // B) Referal tizimi
            const targetCount = await getReferralStats(userId);
            const [referral] = await Referral.findOrCreate({
                where: { owner_id: userId, status: 'pending' },
                defaults: { target_count: targetCount }
            });

            const refLink = `https://t.me/${ctx.botInfo.username}?start=ref_${userId}`;
            
            return ctx.reply(
                `Hozirgi imkoniyatlaringiz tugadi. ⏳\n\nYana imkoniyat olish uchun botga **${targetCount} ta** do'stingizni taklif qiling.\n\n` +
                `` +
                `Sizning havolangiz:\n${refLink}`,
                Markup.inlineKeyboard([
                    [Markup.button.url("Do'stlarga yuborish 🚀", `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent("Bu bot rasmlarni super sifatli qilar ekan!")}`)]
                ])
            );
        }

        // --- 3. AI JARAYONI ---
        loadingMsg = await ctx.reply(MESSAGES.loading);

        const savedFileName = await downloadTelegramPhoto(ctx, manualFileId);
        if (!savedFileName) throw new Error("Yuklab olishda xatolik.");

        await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, MESSAGES.processing).catch(() => {});

        photoPath = path.join("photos", savedFileName);
        const newPhotoName = `${uuid()}.png`;
        restoredPhotoPath = path.join("restored_photos", newPhotoName);

        if (!fs.existsSync("restored_photos")) fs.mkdirSync("restored_photos", { recursive: true });

        const prompt = isPro 
            ? "Professional photo restoration, 4K, ultra-detailed, natural colorization." 
            : "Improve old photo quality, remove scratches and dust.";

        const result = await processImage(photoPath, prompt, restoredPhotoPath);

        if (result && result.success) {
            await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, MESSAGES.sending).catch(() => {});
            await sendLocalPhoto(ctx, restoredPhotoPath, MESSAGES.success);

            // Limitni kamaytirish va saqlash
            await user.decrement('daily_limit', { by: 1 });
            
            await UserImage.create({
                telegram_id: userId,
                old_image_url: savedFileName,
                new_image_url: newPhotoName
            });

            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
        } else {
            throw new Error(result?.error || "AI xatoligi");
        }
    } catch (err) {
        console.error("Restoration Error:", err);
        if (loadingMsg) ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
        ctx.reply(MESSAGES.error);
    }
};

// --- CALLBACK ACTIONS ---

bot.action(/^check_sub(?::(.+))?$/, async (ctx) => {
    const isSubscribed = await checkSubscription(ctx.from.id);
    const photoId = ctx.match[1];

    if (isSubscribed) {
        await User.update({ daily_limit: 1 }, { where: { telegram_id: ctx.from.id } });
        await ctx.answerCbQuery("Rahmat! Obuna tasdiqlandi.");
        
        if (photoId) {
            const photo = await Photo.findOne({ where: { id: photoId } });
            if (photo) {
                await ctx.editMessageText("Obuna tasdiqlandi! Ishni boshlaymiz... ⚙️");
                return handlePhotoRestoration(ctx, false, photo.file_id);
            }
        }
        await ctx.editMessageText("Obuna tasdiqlandi! Rasm yuboring. 👇");
    } else {
        await ctx.answerCbQuery("Siz hali obuna bo'lmadingiz! ❌", { show_alert: true });
    }
});

bot.action(/photo_(standard|pro)_(.+)/, async (ctx) => {
    try {
        const type = ctx.match[1];
        const photo_id = ctx.match[2];
        await ctx.deleteMessage().catch(() => {});
        
        const photo = await Photo.findOne({ where: { id: photo_id } });
        if (!photo) return ctx.reply("Rasm topilmadi, qaytadan yuboring.");

        handlePhotoRestoration(ctx, type === 'pro', photo.file_id);
    } catch (err) { console.log(err); }
});

// --- MESSAGES & PHOTO HANDLING ---

bot.on("photo", async (ctx) => {
    const photo = await Photo.create({ file_id: ctx.message.photo[ctx.message.photo.length - 1].file_id });

    await ctx.reply("Rasm sifatini qanday yaxshilaymiz? 👇", Markup.inlineKeyboard([
        [Markup.button.callback("⚙️ Standart", `photo_standard_${photo.id}`),
         Markup.button.callback("🎨 Rangli + HD", `photo_pro_${photo.id}`)]
    ]));
});

bot.on("message", async (ctx) => {
    const { id, first_name } = ctx.from;
    const startPayload = ctx.message.text ? ctx.message.text.split(" ")[1] : null;

    try {
        const [user, created] = await User.findOrCreate({
            where: { telegram_id: id },
            defaults: { first_name, daily_limit: 1, last_reset: new Date() }
        });

        // REFERAL TEKSHIRUVI
        if (created && startPayload && startPayload.startsWith("ref_")) {
            const referrerId = startPayload.replace("ref_", "");
            
            const activeRef = await Referral.findOne({
                where: { owner_id: referrerId, status: 'pending' }
            });

            if (activeRef) {
                activeRef.current_count += 1;
                if (activeRef.current_count >= activeRef.target_count) {
                    activeRef.status = 'completed';
                    await User.increment('daily_limit', { by: 1, where: { telegram_id: referrerId } });
                    await bot.telegram.sendMessage(referrerId, "Tabriklaymiz! Do'stingiz qo'shildi. Sizga +1 imkoniyat berildi! 🎁");
                }
                await activeRef.save();
            }
        }

        if (ctx.message.text === "/start") return ctx.reply(MESSAGES.welcome);
        if (!ctx.message.photo) ctx.reply(MESSAGES.noPhoto);

    } catch (err) { console.error(err); }
});

bot.command("admin", async (ctx) => {
    const count = await User.count({});
    ctx.reply(`Jami userlar: ${count} ta`);
});

bot.command("limit", async (ctx) => {
    const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
    ctx.reply(`Sizning qolgan imkoniyatlaringiz: ${user.daily_limit} ta`);
});