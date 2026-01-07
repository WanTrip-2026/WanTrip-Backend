import express, { Router, Request, Response } from 'express';
import LinePayService from './routes/LinePayService';
import { getEcpayToken } from './routes/ECPayService';

const PaymentRouter: Router = express.Router();

PaymentRouter.post('/get-token', async (req: Request, res: Response): Promise<void> => {
    try {
        const amount: number = Number(req.body.amount);
        const merchantTradeNo: string = `WT${Date.now()}`;

        const paymentResult = await getEcpayToken(amount, merchantTradeNo);
        
        res.json(paymentResult);
    } catch (error) {
        console.error('--- ECPay Router Error ---', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to retrieve ECPay token' 
        });
    }
});

PaymentRouter.use(LinePayService.router);

export default PaymentRouter;