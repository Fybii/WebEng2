import React, { useCallback, useEffect, useRef, useState } from "react";

const ANIMATION_DURATION = 220;

/**
 * AppNotification component
 * 
 * Component to visualize Notifcations with different states:
 * - info
 * - success
 * - warning
 * - danger / error
 * 
 * params:
 * type: notification type (info, success, warning, danger/error)
 * title: notification header
 * message: notification message
 * onClose: function after closing
 * actionText: text for optional button, e.g.: "try again"
 * onAction: function after clicking the optional button
 * autoCloseMs: time to automaticaly close the notification
 */
const AppNotification = ({
    type = 'info', // info, success, warning, danger
    title,
    message,
    onClose,
    actionText,
    onAction,
    autoCloseMs = null
}) => {
    const [isClosing, setIsClosing] = useState(false);
    const closeTimeoutRef = useRef(null);
    const autoCloseTimeoutRef = useRef(null);

    const handleClose = useCallback(() => {
        if (isClosing)
            return;
        
        setIsClosing(true);

        closeTimeoutRef.current = setTimeout(() => {
            if (onClose) {
                onClose();
            }
        }, ANIMATION_DURATION);
    }, [isClosing, onClose]);

    // runs if notification changes
    useEffect(() => {
        setIsClosing(false);

        return () => {
            clearTimeout(closeTimeoutRef.current);
            clearTimeout(autoCloseTimeoutRef.current);
        }
    }, [type, title, message]);

    // runs if autoclose is set
    useEffect(() => {
        clearTimeout(autoCloseTimeoutRef.current);

        if (!autoCloseMs || autoCloseMs <= 0 || !onClose)
            return;

        autoCloseTimeoutRef.current = setTimeout(() => {
            handleClose();
        }, autoCloseMs);

        return () => {
            clearTimeout(autoCloseTimeoutRef.current);
        };
    }, [autoCloseMs, onClose]);

    if (!title && !message)
        return null;

    return (
        <div className={`app-notification app-notification-${type} ${isClosing ? 'is-closing' : ''}`}>
            <div className="app-notification-icon">
                <img src={`/assets/icons/icon-${type}.svg`}/>
            </div>
            <div className="app-notification-meta">
                <div className="app-notification-title">{title}</div>
            <div className="app-notification-message">{message}</div>
            </div>
            <div className="app-notification-close">
                <img src="/assets/icons/icon-dismiss.svg" onClick={handleClose}/>
            </div>
            <div className="app-notification-action">
                <button className="button button-secondary" onClick={handleClose} type="button">Schließen</button>
                {actionText && onAction && (
                    <button className={`button button-${type}`} onClick={onAction} type="button">{actionText}</button>
                )}
            </div>
        </div>
    )
};

export default AppNotification;