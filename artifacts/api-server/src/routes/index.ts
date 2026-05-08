import { Router, type IRouter } from "express";
import healthRouter from "./health";
import protocolsRouter from "./protocols";
import lotsRouter from "./lots";
import resultsRouter from "./results";
import kineticsRouter from "./kinetics";
import certificatesRouter from "./certificates";
import authRouter from "./auth";
import methodologiesRouter from "./methodologies";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(protocolsRouter);
router.use(lotsRouter);
router.use(resultsRouter);
router.use(kineticsRouter);
router.use(certificatesRouter);
router.use(methodologiesRouter);

export default router;
