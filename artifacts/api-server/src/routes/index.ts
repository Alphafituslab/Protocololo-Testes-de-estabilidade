import { Router, type IRouter } from "express";
import { sessionMiddleware } from "../lib/session";
import healthRouter from "./health";
import protocolsRouter from "./protocols";
import lotsRouter from "./lots";
import resultsRouter from "./results";
import kineticsRouter from "./kinetics";
import certificatesRouter from "./certificates";
import authRouter from "./auth";
import methodologiesRouter from "./methodologies";
import usersRouter from "./users";
import auditLogsRouter from "./audit-logs";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(sessionMiddleware);

router.use(authRouter);
router.use(healthRouter);
router.use(protocolsRouter);
router.use(lotsRouter);
router.use(resultsRouter);
router.use(kineticsRouter);
router.use(certificatesRouter);
router.use(methodologiesRouter);
router.use(usersRouter);
router.use(auditLogsRouter);
router.use(settingsRouter);

export default router;
