const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "",
    },
  },
  { timestamps: true }
);

userSchema.methods.toPublicJson = function toPublicJson() {
  return {
    id: this._id.toString(),
    email: this.email,
    name: this.name || "",
  };
};

module.exports = mongoose.model("User", userSchema);
