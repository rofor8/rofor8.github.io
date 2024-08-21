// At the top of your auth.js file
console.log('Current origin:', window.location.origin);

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

        google.accounts.id.renderButton(
            document.getElementById('googleSignInButton'),
            { theme: 'outline', size: 'large' }
        );

        google.accounts.id.prompt();
    } catch (error) {
        console.error('Error initializing Google Sign-In:', error);
        alert('An error occurred while setting up Google Sign-In. Please try again later or contact support.');
    }
}

function handleCredentialResponse(response) {
    if (response.error) {
        console.error('Authentication error:', response.error);
        alert('An error occurred during sign-in. Please try again.');
        return;
    }
    console.log('Authentication successful');
    isSignedIn = true;
    document.getElementById('googleSignInButton').style.display = 'none';
    document.getElementById('signOutButton').style.display = 'inline-block';
    document.getElementById('startAppButton').style.display = 'inline-block';
    
    // Decode the JWT to get user information
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    console.log('User info:', payload);
    
    // You can use payload.name, payload.email, payload.picture, etc.
}

function signOut() {
    google.accounts.id.disableAutoSelect();
    isSignedIn = false;
    document.getElementById('googleSignInButton').style.display = 'block';
    document.getElementById('signOutButton').style.display = 'none';
    document.getElementById('startAppButton').style.display = 'none';
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