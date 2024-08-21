let isSignedIn = false;
let tokenClient;
let user;

function initializeGSI() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: '20635675841-uf569724tui760htgqgqebfi6echcoku.apps.googleusercontent.com',
        scope: 'profile email',
        callback: (response) => {
            if (response.error) {
                console.error('Error during token request:', response.error);
                return;
            }
            handleCredentialResponse(response);
        },
    });

    google.accounts.id.initialize({
        client_id: '20635675841-uf569724tui760htgqqgebfi6echcoku.apps.googleusercontent.com',
        callback: handleCredentialResponse,
    });

    google.accounts.id.renderButton(
        document.getElementById('googleSignInButton'),
        { theme: 'outline', size: 'large' }
    );

    google.accounts.id.prompt(); // Automatically prompt the user for sign-in
}

function handleCredentialResponse(response) {
    console.log('Encoded JWT ID token: ' + response.credential);
    isSignedIn = true;
    document.getElementById('googleSignInButton').style.display = 'none';
    document.getElementById('signOutButton').style.display = 'inline-block';
    document.getElementById('startAppButton').style.display = 'inline-block';
}

function signOut() {
    google.accounts.id.disableAutoSelect();
    console.log('User signed out.');
    isSignedIn = false;
    document.getElementById('googleSignInButton').style.display = 'block';
    document.getElementById('signOutButton').style.display = 'none';
    document.getElementById('startAppButton').style.display = 'none';
}

window.signOut = signOut;
window.isSignedIn = isSignedIn;
