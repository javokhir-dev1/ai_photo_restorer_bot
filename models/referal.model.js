import { DataTypes } from "sequelize"
import { sequelize } from "../config/db.js"

export const Referral = sequelize.define("Referral", {
    owner_id: { // Taklif qilgan odam (User telegram_id)
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    target_count: { // Nechta odam taklif qilishi kerak (1, 2, 3...)
        type: DataTypes.INTEGER,
        defaultValue: 1
    },
    current_count: { // Hozircha nechta odam kirdi
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    status: { // 'pending' yoki 'completed'
        type: DataTypes.STRING,
        defaultValue: 'pending'
    }
});