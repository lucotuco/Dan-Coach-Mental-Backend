import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true, 
      trim: true
    },
    password: {
      type: String,
      required: true,
    },
    birthDate: {
      type: Date,
      required: false,
    },
    rol:{
    type:String,
      enum: ['coach' | 'member'],
    },
    teamId:{
      type:[ mongoose.Schema.Types.ObjectId | null],
      ref: 'Team', default: null  
    },
    coachOfTeamId:{
      type:[ mongoose.Schema.Types.ObjectId | null]
    }
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
