import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: false,
    },
    ownerUserId:{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdAt:{
      type:Date
    },
    settings:{
      type: String
    },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
