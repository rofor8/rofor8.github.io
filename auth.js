// auth.js
let isSignedIn = false;
let tokenClient;
let googleApiLoaded = false;

function initializeGSI() {
    let CLIENT_ID;
    
    // Determine which client ID to use based on the current origin
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        CLIENT_ID = 'YOUR_LOCALHOST_CLIENT_ID'; // Replace with your localhost client ID
    } else {
        CLIENT_ID = '20635675841-uf569724tui760htgqgqebfi6echcoku.apps.googleusercontent.com';
    }
    
    console.log('Initializing Google Sign-In with Client ID:', CLIENT_ID);
    console.log('Current origin:', window.location.origin);

    // Load the Google API client library
    loadGoogleApiScript(CLIENT_ID);
}

function loadGoogleApiScript(clientId) {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
        googleApiLoaded = true;
        initializeGoogleSignIn(clientId);
    };
    script.onerror = () => {
        console.error('Failed to load Google API script');
        googleApiLoaded = false;
    };
    document.head.appendChild(script);
}

function initializeGoogleSignIn(clientId) {
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'profile email',
            callback: handleCredentialResponse
        });

        google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse
        });

        const signInButton = document.getElementById('googleSignInButton');
        if (signInButton) {
            google.accounts.id.renderButton(signInButton, { theme: 'outline', size: 'large' });
        } else {
            console.warn('Google Sign-In button element not found');
        }

        google.accounts.id.prompt();
    } catch (error) {
        console.error('Error initializing Google Sign-In:', error);
    }
}

function handleCredentialResponse(response) {
    if (response.error) {
        console.error('Authentication error:', response.error);
        return;
    }
    console.log('Authentication successful');
    isSignedIn = true;
    localStorage.setItem('isSignedIn', 'true');
    
    // Dispatch a custom event for sign in
    const event = new CustomEvent('userSignedIn', { detail: response });
    window.dispatchEvent(event);
    
    // Decode the JWT to get user information
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    console.log('User info:', payload);

    // Update UI to show "Get Started" button instead of redirecting
    updateUIAfterSignIn();
}

function updateUIAfterSignIn() {
    const signInButton = document.getElementById('googleSignInButton');
    const startAppButton = document.getElementById('startAppButton');
    const signOutButton = document.getElementById('signOutButton');

    if (signInButton) signInButton.style.display = 'none';
    if (startAppButton) startAppButton.style.display = 'inline-block';
    if (signOutButton) signOutButton.style.display = 'inline-block';
}

function signOut() {
    if (googleApiLoaded && typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        google.accounts.id.disableAutoSelect();
    } else {
        console.warn('Google API not loaded. Proceeding with local sign-out.');
    }
    
    isSignedIn = false;
    localStorage.removeItem('isSignedIn');
    
    // Dispatch a custom event for sign out
    const event = new CustomEvent('userSignedOut');
    window.dispatchEvent(event);
    
    console.log('User signed out.');

    // Update UI to show sign-in button
    updateUIAfterSignOut();

    // Redirect to the landing page
    window.location.href = 'index.html';
}

function updateUIAfterSignOut() {
    const signInButton = document.getElementById('googleSignInButton');
    const startAppButton = document.getElementById('startAppButton');
    const signOutButton = document.getElementById('signOutButton');

    if (signInButton) signInButton.style.display = 'inline-block';
    if (startAppButton) startAppButton.style.display = 'none';
    if (signOutButton) signOutButton.style.display = 'none';
}

function isUserSignedIn() {
    return localStorage.getItem('isSignedIn') === 'true';
}

function checkAuthAndUpdateUI() {
    if (isUserSignedIn()) {
        updateUIAfterSignIn();
    } else {
        updateUIAfterSignOut();
    }
}

// Expose necessary functions to the global scope
window.signOut = signOut;
window.isUserSignedIn = isUserSignedIn;
window.initializeGSI = initializeGSI;
window.checkAuthAndUpdateUI = checkAuthAndUpdateUI;

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    initializeGSI();
    checkAuthAndUpdateUI();
});