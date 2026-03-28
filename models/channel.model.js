import { DataTypes } from "sequelize"
import { sequelize } from "../config/db.js"

export const Channel = sequelize.define("Channel", {
    telegram: {
        type: DataTypes.STRING,
        allowNull: true,
    },
}, {
    timestamps: true,
})