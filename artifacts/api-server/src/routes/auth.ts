import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/auth/verify", (req, res): void => {
  const { password } = req.body as { password?: string };
  const masterPassword = process.env["MASTER_PASSWORD"];

  if (!masterPassword) {
    res.status(503).json({ error: "Senha mestra não configurada no servidor." });
    return;
  }

  if (!password || password !== masterPassword) {
    res.status(401).json({ error: "Senha incorreta." });
    return;
  }

  res.json({ ok: true });
});

export default router;
