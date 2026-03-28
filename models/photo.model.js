import { DataTypes } from "sequelize"
import { sequelize } from "../config/db.js"

export const Photo = sequelize.define("Photo", {
    file_id: {
        type: DataTypes.TEXT,
    },
}, {
    timestamps: true,
})