import urllib.request
import urllib.parse
import json
import uuid

# --- MERCHANT PHONE NUMBERS (à remplacer par vos vrais numéros) ---
MVOLA_MERCHANT_PHONE = "0340000000"
ORANGE_MONEY_MERCHANT_PHONE = "0320000000"
AIRTEL_MONEY_MERCHANT_PHONE = "0330000000"

# --- USSD CODES ---
# (num) = numéro du marchand, (solde) = montant à payer
MVOLA_USSD_TEMPLATE = "#111*1*2*{phone}*{amount}*2*47#"
ORANGE_MONEY_USSD_TEMPLATE = "#144*11*{phone}*{phone}*{amount}*2#"
AIRTEL_MONEY_USSD_TEMPLATE = "*436*2*1*1*{phone}*{amount}*2#"


def _format_ussd(template: str, phone: str, amount: float) -> str:
    amount_int = int(amount)
    return template.format(phone=phone, amount=amount_int)


def initiate_mvola_payment(amount: float, phone: str, order_id: int) -> dict:
    ussd = _format_ussd(MVOLA_USSD_TEMPLATE, MVOLA_MERCHANT_PHONE, amount)
    txn_id = f"MV-{uuid.uuid4().hex[:12].upper()}"
    print(f"[MVOLA] Paiement initié pour Commande #{order_id} | Montant: Ar {amount} | Tél: {phone}")
    print(f"[MVOLA] Code USSD à composer: {ussd}")
    return {
        "success": True,
        "transaction_id": txn_id,
        "status": "pending",
        "ussd_code": ussd,
        "message": "Connectez-vous sur votre téléphone, ouvrez votre application de téléphone et composez le code USSD ci-dessous pour effectuer le paiement via MVola.",
        "instruction": f"1. Ouvrez l'application Téléphone sur votre appareil.\n2. Composez le code USSD suivant : {ussd}\n3. Suivez les instructions à l'écran pour confirmer le paiement de Ar {int(amount)}.\n4. Revenez ici après confirmation."
    }


def initiate_orange_money_payment(amount: float, phone: str, order_id: int) -> dict:
    ussd = _format_ussd(ORANGE_MONEY_USSD_TEMPLATE, ORANGE_MONEY_MERCHANT_PHONE, amount)
    txn_id = f"OM-{uuid.uuid4().hex[:12].upper()}"
    print(f"[ORANGE MONEY] Paiement initié pour Commande #{order_id} | Montant: Ar {amount} | Tél: {phone}")
    print(f"[ORANGE MONEY] Code USSD à composer: {ussd}")
    return {
        "success": True,
        "transaction_id": txn_id,
        "status": "pending",
        "ussd_code": ussd,
        "message": "Connectez-vous sur votre téléphone, ouvrez votre application de téléphone et composez le code USSD ci-dessous pour effectuer le paiement via Orange Money.",
        "instruction": f"1. Ouvrez l'application Téléphone sur votre appareil.\n2. Composez le code USSD suivant : {ussd}\n3. Suivez les instructions à l'écran pour confirmer le paiement de Ar {int(amount)}.\n4. Revenez ici après confirmation."
    }


def initiate_airtel_money_payment(amount: float, phone: str, order_id: int) -> dict:
    ussd = _format_ussd(AIRTEL_MONEY_USSD_TEMPLATE, AIRTEL_MONEY_MERCHANT_PHONE, amount)
    txn_id = f"AM-{uuid.uuid4().hex[:12].upper()}"
    print(f"[AIRTEL MONEY] Paiement initié pour Commande #{order_id} | Montant: Ar {amount} | Tél: {phone}")
    print(f"[AIRTEL MONEY] Code USSD à composer: {ussd}")
    return {
        "success": True,
        "transaction_id": txn_id,
        "status": "pending",
        "ussd_code": ussd,
        "message": "Connectez-vous sur votre téléphone, ouvrez votre application de téléphone et composez le code USSD ci-dessous pour effectuer le paiement via Airtel Money.",
        "instruction": f"1. Ouvrez l'application Téléphone sur votre appareil.\n2. Composez le code USSD suivant : {ussd}\n3. Suivez les instructions à l'écran pour confirmer le paiement de Ar {int(amount)}.\n4. Revenez ici après confirmation."
    }


def initiate_paypal_payment(amount_usd: float, order_id: int) -> dict:
    print(f"[PAYPAL] Initiating order capture for Order #{order_id} | Amount: ${amount_usd:.2f}")
    txn_id = f"PP-{uuid.uuid4().hex[:12].upper()}"
    return {
        "success": True,
        "transaction_id": txn_id,
        "status": "completed",
        "redirect_url": None,
        "message": "PayPal payment simulated successfully."
    }


def initiate_card_payment(amount: float, token: str, order_id: int) -> dict:
    print(f"[CARD] Charging card token {token} for Order #{order_id} | Amount: Ar {amount}")
    txn_id = f"CC-{uuid.uuid4().hex[:12].upper()}"
    return {
        "success": True,
        "transaction_id": txn_id,
        "status": "completed",
        "message": "Card payment charged successfully."
    }
