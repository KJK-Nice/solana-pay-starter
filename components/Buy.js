import React, { useState, useEffect, useMemo } from 'react';
import { Keypair, Transaction } from "@solana/web3.js";
import { findReference, FindReferenceError } from "@solana/pay";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { InfinitySpin } from 'react-loader-spinner';
import IPFSDownload from './IpfsDownload';
import { addOrder, hasPurchased, fetchItem } from '../lib/api';


const STATUS = {
    Initial: "Initial",
    Submitted: "Submitted",
    Paid: "Paid",
}

export default function Buy({ itemID }) {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();
    const orderID = useMemo(() => Keypair.generate().publicKey, []); // Public key used to identity the order

    const [item, setItem] = useState(null); // IPFS hash & filename of the purchased item
    const [loading, setLoading] = useState(false); // Loading state of all above
    const [status, setStatus] = useState(STATUS.Initial); // Tracking transaction status

    // useMemo is a React hook that only computes the value if the dependencies change
    const order = useMemo(
        () => ({
            buyer: publicKey.toString(),
            orderID: orderID.toString(),
            itemID: itemID,
        }),
        [publicKey, orderID, itemID]
    );

    const processTransaction = async () => {
        setLoading(true);
        const txResponse = await fetch("../api/createTransaction", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(order),
        });
        const txData = await txResponse.json();

        // We create a transaction object
        const tx = Transaction.from(Buffer.from(txData.transaction, "base64"));
        console.log("Tx data is", tx);

        // Attempt to send the transaction to the network
        try {
            // Send the transaction to the network
            const txHash = await sendTransaction(tx, connection);
            console.log(`Transaction sent: https://solscan.io/tx/${txHash}?cluster=devnet`);
            // Even though this could fail, we're just going to set it to true for now
            setStatus(STATUS.Submitted);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        async function checkPurchased() {
            const purchased = await hasPurchased(publicKey, itemID);
            if (purchased) {
                setStatus(STATUS.Paid);
                const item = await fetchItem(itemID);
                setItem(item);
            }
        }
        checkPurchased();
    }, [publicKey, itemID])

    useEffect(() => {
        // Check if transaction was confirmed
        if (status === STATUS.Submitted) {
            const interval = setInterval(async () => {
                try {
                    // Look for our orderID on the blockchain
                    const result = await findReference(connection, orderID);
                    console.log("Finding tx reference", result.confirmationStatus);

                    // If the transaction is confirmed or finalized, the payment was successful!
                    if (
                        result.confirmationStatus === "confirmed" || 
                        result.confirmationStatus === "finallized"
                    ) {
                        clearInterval(interval);
                        setStatus(STATUS.Paid);
                        setLoading(false);
                        addOrder(order);
                        alert("Thank you for your purchase!");
                    }
                } catch (error) {
                    if (error instanceof FindReferenceError) {
                        return null;
                    }
                    console.error("Unknown error", error);
                } finally {
                    setLoading(false);
                }
            }, 1000);
            return () => {
                clearInterval(interval);
            };
        }
        async function getItem(itemID) {
            const item = await fetchItem(itemID);
            setItem(item)
        }

        if (status === STATUS.Paid) {
            getItem(itemID);
        }
    }, [status])

    if (!publicKey) {
        return (
            <div>
                <p>You need to connect your wallet to make transactions</p>
            </div>
        );
    }

    if (loading) {
        return <InfinitySpin color="gray" />;
    }

    return (
        <div>
            {item ? (
                <IPFSDownload 
                    filename={item.filename} 
                    hash={item.hash} 
                />
            ) : (
                <button 
                    disabled={loading} 
                    className="buy-button" 
                    onClick={processTransaction}
                >
                    Buy now
                </button>
            )}
        </div>
    );
}