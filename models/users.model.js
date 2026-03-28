import { DataTypes } from "sequelize"
import { sequelize } from "../config/db.js"

export const User = sequelize.define("User", {
    telegram_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        unique: true,
    },
    first_name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    last_name: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    username: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    language_code: {
        type: DataTypes.STRING(10),
        defaultValue: "uz",
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    daily_limit: {
        type: DataTypes.INTEGER,
        defaultValue: 1 // Yangi userga avtomatik 1 ta imkoniyat beradi
    },
    last_reset: {
        type: DataTypes.DATE, // STRING o'rniga DATE ishlatamiz
        defaultValue: DataTypes.NOW // Hozirgi vaqtni avtomatik qo'yadi
    }
}, {
    timestamps: true,
})