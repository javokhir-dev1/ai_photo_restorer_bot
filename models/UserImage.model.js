import { DataTypes } from "sequelize"
import { sequelize } from "../config/db.js"

export const UserImage = sequelize.define("UserImage", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    telegram_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    old_image_url: {
        type: DataTypes.TEXT, 
        allowNull: true
    },
    new_image_url: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: "completed",
    }
}, {
    timestamps: true,
})