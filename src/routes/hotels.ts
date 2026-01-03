import express, { Request, Response } from "express";
import { supabase } from "../supabase.js";

const router = express.Router();

router.get("/", async (_req: Request, res: Response) => {
  const { data, error } = await supabase.from("hotels").select("*");

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

export default router;
