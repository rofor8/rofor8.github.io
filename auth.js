// auth.js
let isSignedIn = false;
let tokenClient;

function initializeGSI() {
    const CLIENT_ID = '20635675841-uf569724tui760htgqgqebfi6echcoku.apps.googleusercontent.com';
    
    console.log('Initializing Google Sign-In with Client ID:', CLIENT_ID);
    console.log('Current origin:', window.location.origin);

    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: 'profile email',
            callback: handleCredentialResponse
        });

        google.accounts.id.initialize({
            client_id: CLIENT_ID,
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
    
    const signInButton = document.getElementById('googleSignInButton');
    const signOutButton = document.getElementById('signOutButton');
    const startAppButton = document.getElementById('startAppButton');
    
    if (signInButton) signInButton.style.display = 'none';
    if (signOutButton) signOutButton.style.display = 'inline-block';
    if (startAppButton) startAppButton.style.display = 'inline-block';
    
    // Decode the JWT to get user information
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    console.log('User info:', payload);
}

function signOut() {
    google.accounts.id.disableAutoSelect();
    isSignedIn = false;
    
    const signInButton = document.getElementById('googleSignInButton');
    const signOutButton = document.getElementById('signOutButton');
    const startAppButton = document.getElementById('startAppButton');
    
    if (signInButton) signInButton.style.display = 'block';
    if (signOutButton) signOutButton.style.display = 'none';
    if (startAppButton) startAppButton.style.display = 'none';
    
    console.log('User signed out.');
}

async function checkSignInStatus() {
    return new Promise((resolve) => {
        if (isSignedIn) {
            resolve(true);
        } else {
            google.accounts.id.prompt((notification) => {
                if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                    resolve(false);
                }
            });
        }
    });
}

window.onload = initializeGSI;
window.signOut = signOut;
window.checkSignInStatus = checkSignInStatus;