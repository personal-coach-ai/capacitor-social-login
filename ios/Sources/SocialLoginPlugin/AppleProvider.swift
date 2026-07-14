import Foundation
import AuthenticationServices

#if canImport(Alamofire)
import Alamofire
#endif

import UIKit
import Security

struct AppleProviderResponse: Codable {
    let accessToken: AccessTokenApple?
    let profile: AppleProfile
    let idToken: String?
    let authorizationCode: String?
}

struct AppleProfile: Codable {
    let user: String
    let email: String?
    let givenName: String?
    let familyName: String?
}

struct AccessTokenApple: Codable {
    let token: String
    let expiresIn: Int?
    let refreshToken: String?

    init(token: String, expiresIn: Int? = nil, refreshToken: String? = nil) {
        self.token = token
        self.expiresIn = expiresIn
        self.refreshToken = refreshToken
    }
}

// Define the Decodable structs for the response
struct TokenResponse: Decodable {
    let access_token: String?
    let expires_in: Int?
    let refresh_token: String?
    let id_token: String?
}

// Define the custom error enum
enum AppleProviderError: Error {
    case userDataSerializationError
    case responseError(Error)
    case invalidResponseCode(statusCode: Int)
    case jsonParsingError
    case specificJsonWritingError(Error)
    case noLocationHeader
    case pathComponentsNotFound
    case successPathComponentNotProvided
    case backendDidNotReturnSuccess(successValue: String)
    case missingAccessToken
    case missingExpiresIn
    case missingRefreshToken
    case missingIdToken
    case missingAuthorizationCode
    case missingUserId
    case unknownError
    case invalidIdToken
    case invalidAuthorizationCredential
    case authorizationPresentationWindowUnavailable
}

// Implement LocalizedError for AppleProviderError
extension AppleProviderError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case .userDataSerializationError:
            return NSLocalizedString("Error converting user data to JSON string.", comment: "")
        case .responseError(let error):
            return NSLocalizedString("Response error: \(error.localizedDescription)", comment: "")
        case .invalidResponseCode(let statusCode):
            return NSLocalizedString("Invalid response code: \(statusCode).", comment: "")
        case .noLocationHeader:
            return NSLocalizedString("No Location header found in the redirect response.", comment: "")
        case .pathComponentsNotFound:
            return NSLocalizedString("Path components not found.", comment: "")
        case .successPathComponentNotProvided:
            return NSLocalizedString("Success path component not provided.", comment: "")
        case .backendDidNotReturnSuccess(let successValue):
            return NSLocalizedString("Backend did not return success=true, it returned success=\(successValue).", comment: "")
        case .jsonParsingError:
            return NSLocalizedString("Error parsing JSON response.", comment: "")
        case .specificJsonWritingError(let error):
            return NSLocalizedString("Error writing JSON. Error: \(error)", comment: "")
        case .unknownError:
            return NSLocalizedString("An unknown error occurred.", comment: "")
        case .missingAccessToken:
            return NSLocalizedString("Access token not found in response.", comment: "")
        case .missingExpiresIn:
            return NSLocalizedString("ExpiresIn not found in response.", comment: "")
        case .missingRefreshToken:
            return NSLocalizedString("Refresh token not found in response.", comment: "")
        case .missingIdToken:
            return NSLocalizedString("ID token not found in response.", comment: "")
        case .missingAuthorizationCode:
            return NSLocalizedString("Authorization code not found in response.", comment: "")
        case .missingUserId:
            return NSLocalizedString("User ID not found in ID token.", comment: "")
        case .invalidIdToken:
            return NSLocalizedString("Invalid ID token format.", comment: "")
        case .invalidAuthorizationCredential:
            return NSLocalizedString("Apple returned an unsupported authorization credential.", comment: "")
        case .authorizationPresentationWindowUnavailable:
            return NSLocalizedString("Unable to find an active window for Apple Sign-In.", comment: "")
        }
    }
}

#if canImport(Alamofire)
class AppleProvider: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var completion: ((Result<AppleProviderResponse, Error>) -> Void)?
    private var authorizationController: ASAuthorizationController?
    private weak var presentationWindow: UIWindow?

    // Instance variables
    var idToken: String?
    var refreshToken: String?
    var accessToken: String?

    private let TOKEN_URL = "https://appleid.apple.com/auth/token"
    private let SHARED_PREFERENCE_NAME = "AppleProviderSharedPrefs_0eda2642"
    private let KEYCHAIN_ACCOUNT = "apple-provider-tokens"
    private var redirectUrl = ""
    private let USER_INFO_KEY = "AppleUserInfo"
    private var useProperTokenExchange = false

    func initialize(redirectUrl: String? = nil, useProperTokenExchange: Bool = false) {
        if let redirectUrl = redirectUrl {
            self.redirectUrl = redirectUrl
        }
        self.useProperTokenExchange = useProperTokenExchange

        do {
            try retrieveState()
        } catch {
            print("Apple retrieveState failed: \(error.localizedDescription)")
        }
    }

    func setPresentationWindow(_ window: UIWindow?) {
        presentationWindow = window
    }

    private var keychainQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: SHARED_PREFERENCE_NAME,
            kSecAttrAccount as String: KEYCHAIN_ACCOUNT
        ]
    }

    private func readKeychainState() throws -> Data? {
        var result: CFTypeRef?
        let status = SecItemCopyMatching(keychainQuery as CFDictionary, &result)

        if status == errSecItemNotFound {
            return nil
        }

        guard status == errSecSuccess else {
            throw NSError(
                domain: "AppleProvider.Keychain",
                code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Unable to read Apple Sign-In state from Keychain."]
            )
        }

        return result as? Data
    }

    private func writeKeychainState(_ data: Data) throws {
        SecItemDelete(keychainQuery as CFDictionary)

        var attributes = keychainQuery
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(
                domain: "AppleProvider.Keychain",
                code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Unable to save Apple Sign-In state in Keychain."]
            )
        }
    }

    private func clearPersistedState() {
        SecItemDelete(keychainQuery as CFDictionary)
        // Remove state written by versions before this fork so it cannot remain in plaintext preferences.
        UserDefaults.standard.removeObject(forKey: SHARED_PREFERENCE_NAME)
    }

    func persistState(idToken: String, refreshToken: String, accessToken: String) throws {
        // Create a dictionary to represent the JSON object
        let object: [String: String] = [
            "idToken": idToken,
            "refreshToken": refreshToken,
            "accessToken": accessToken
        ]

        // Assign to instance variables
        self.idToken = idToken
        self.refreshToken = refreshToken
        self.accessToken = accessToken

        // Convert the object to JSON data
        let jsonData = try JSONSerialization.data(withJSONObject: object, options: [])

        try writeKeychainState(jsonData)
        // Do not leave previously persisted tokens in plaintext preferences.
        UserDefaults.standard.removeObject(forKey: SHARED_PREFERENCE_NAME)
    }

    func retrieveState() throws {
        var jsonData = try readKeychainState()
        var migratedLegacyState = false

        // Migrate one-time from the old plaintext UserDefaults location.
        if jsonData == nil,
           let legacyJsonString = UserDefaults.standard.string(forKey: SHARED_PREFERENCE_NAME),
           let legacyJsonData = legacyJsonString.data(using: .utf8) {
            jsonData = legacyJsonData
            migratedLegacyState = true
        }

        guard let jsonData = jsonData else { return }

        // Parse the JSON data
        guard let object = try JSONSerialization.jsonObject(with: jsonData, options: []) as? [String: String] else {
            return
        }

        // Extract tokens
        guard let idToken = object["idToken"],
              let refreshToken = object["refreshToken"],
              let accessToken = object["accessToken"] else {
            return
        }

        // Assign to instance variables
        self.idToken = idToken
        self.refreshToken = refreshToken
        self.accessToken = accessToken

        if migratedLegacyState {
            try writeKeychainState(jsonData)
            UserDefaults.standard.removeObject(forKey: SHARED_PREFERENCE_NAME)
        }
    }

    private func resolvePresentationWindow() -> UIWindow? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }

        return windows.first(where: { $0.isKeyWindow && !$0.isHidden })
            ?? windows.first(where: { !$0.isHidden })
    }

    private func finish(_ result: Result<AppleProviderResponse, Error>) {
        let callback = completion
        completion = nil
        authorizationController = nil
        callback?(result)
    }

    func login(payload: [String: Any], completion: @escaping (Result<AppleProviderResponse, Error>) -> Void) {
        if authorizationController != nil {
            completion(.failure(NSError(
                domain: "AppleProvider",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "Apple Sign-In is already in progress."]
            )))
            return
        }

        self.completion = completion

        let startAuthorization: () -> Void = { [weak self] in
            guard let self = self else { return }

            let window = self.presentationWindow ?? self.resolvePresentationWindow()
            guard let window = window else {
                self.finish(.failure(AppleProviderError.authorizationPresentationWindowUnavailable))
                return
            }
            self.presentationWindow = window

            let appleIDProvider = ASAuthorizationAppleIDProvider()
            let request = appleIDProvider.createRequest()

            if let scopes = payload["scopes"] as? [ASAuthorization.Scope] {
                request.requestedScopes = scopes
            } else {
                request.requestedScopes = [.fullName, .email]
            }

            if let nonce = payload["nonce"] as? String {
                request.nonce = nonce
            }

            let controller = ASAuthorizationController(authorizationRequests: [request])
            // ASAuthorizationController does not retain itself for the duration of the request.
            // Keep a strong reference until one of the delegate callbacks completes.
            self.authorizationController = controller
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }

        if Thread.isMainThread {
            startAuthorization()
        } else {
            DispatchQueue.main.async(execute: startAuthorization)
        }
    }

    func logout(completion: @escaping (Result<Void, Error>) -> Void) {
        // we check only idtoken, because with apple, refresh token MIGHT not be set
        if self.idToken == nil || ((self.idToken?.isEmpty) == true) {

            completion(.failure(NSError(domain: "AppleProvider", code: 1, userInfo: [NSLocalizedDescriptionKey: "Not logged in; Cannot logout"])))
            return
        }

        self.idToken = nil
        self.refreshToken = nil
        self.accessToken = nil

        clearPersistedState()
        completion(.success(()))
        return
    }

    func refresh(completion: @escaping (Result<Void, Error>) -> Void) {
        // Apple doesn't provide a refresh method
        completion(.success(()))
    }

    // MARK: - ASAuthorizationControllerDelegate

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            finish(.failure(AppleProviderError.invalidAuthorizationCredential))
            return
        }

        do {
            let userIdentifier = appleIDCredential.user
            let fullName = appleIDCredential.fullName
            let email = appleIDCredential.email

            // If we get a name, save it
            if fullName?.givenName != nil || fullName?.familyName != nil {
                persistName(userId: userIdentifier, givenName: fullName?.givenName, familyName: fullName?.familyName)
            }

            // Use saved name as fallback
            let savedName = retrieveName(userId: userIdentifier)
            let finalGivenName = fullName?.givenName ?? savedName?.givenName
            let finalFamilyName = fullName?.familyName ?? savedName?.familyName

            // Create proper access token and decode JWT
            let authorizationCode = String(data: appleIDCredential.authorizationCode ?? Data(), encoding: .utf8) ?? ""
            let idToken = String(data: appleIDCredential.identityToken ?? Data(), encoding: .utf8) ?? ""

            guard !idToken.isEmpty else {
                finish(.failure(AppleProviderError.missingIdToken))
                return
            }

            if useProperTokenExchange && authorizationCode.isEmpty {
                finish(.failure(AppleProviderError.missingAuthorizationCode))
                return
            }

            var accessToken: AccessTokenApple?

            if useProperTokenExchange {
                // When using proper token exchange, set accessToken to nil
                // The authorization code should be exchanged for proper tokens on the backend
                accessToken = nil
            } else {
                // Legacy behavior: use authorization code as access token for backward compatibility
                accessToken = AccessTokenApple(
                    token: authorizationCode,
                    expiresIn: 3600,
                    refreshToken: nil
                )
            }

            // Decode JWT to get email
            var decodedEmail = email
            if let jwt = idToken.split(separator: ".").dropFirst().first {
                let remainder = jwt.count % 4
                var base64String = String(jwt)
                if remainder > 0 {
                    base64String += String(repeating: "=", count: 4 - remainder)
                }

                if let decodedData = Data(base64Encoded: base64String, options: []),
                   let payload = try? JSONSerialization.jsonObject(with: decodedData, options: []) as? [String: Any] {
                    decodedEmail = payload["email"] as? String ?? email
                }
            }

            let response = AppleProviderResponse(
                accessToken: accessToken,
                profile: AppleProfile(
                    user: userIdentifier,
                    email: decodedEmail,
                    givenName: finalGivenName,
                    familyName: finalFamilyName
                ),
                idToken: idToken,
                authorizationCode: useProperTokenExchange ? authorizationCode : nil
            )

            if !self.redirectUrl.isEmpty {
                let firstName = fullName?.givenName ?? ""
                let lastName = fullName?.familyName ?? ""

                // Proper token exchange keeps the one-time authorization code separate
                // from the access-token-shaped legacy response.
                let redirectCode = response.authorizationCode ?? response.accessToken?.token ?? ""
                self.sendRequest(code: redirectCode, identityToken: response.idToken ?? "", email: decodedEmail ?? "", firstName: firstName, lastName: lastName, completion: { result in
                    switch result {
                    case .success(let appleResponse):
                        self.finish(.success(appleResponse))
                    case .failure(let error):
                        self.finish(.failure(error))
                    }
                }, skipUser: fullName?.givenName == nil)
            } else {
                try self.persistState(idToken: response.idToken ?? "", refreshToken: "", accessToken: "")
                self.finish(.success(response))
            }
        }
        catch {
            finish(.failure(AppleProviderError.specificJsonWritingError(error)))
        }
    }

    // identityToken is the JWT generated by apple
    func sendRequest(
        code: String,
        identityToken: String,
        email: String,
        firstName: String,
        lastName: String,
        completion: @escaping ((Result<AppleProviderResponse, AppleProviderError>) -> Void),
        skipUser: Bool
    ) {
        // Prepare the parameters
        var parameters: [String: String] = [
            "code": code
        ]

        if !skipUser {
            let user: [String: Any] = [
                "email": email,
                "name": [
                    "firstName": firstName,
                    "lastName": lastName
                ]
            ]

            // Convert the user dictionary to a JSON string
            guard let userData = try? JSONSerialization.data(withJSONObject: user, options: []),
                  let userJSONString = String(data: userData, encoding: .utf8) else {
                completion(.failure(.userDataSerializationError))
                return
            }

            parameters["user"] = userJSONString
        }

        // Send the POST request
        AF.request(
            self.redirectUrl,
            method: .post,
            parameters: parameters,
            encoding: URLEncoding.default,
            headers: [ "ios-plugin-version": "0.0.0" ]
        )
        .redirect(using: Redirector(behavior: .doNotFollow))
        .response { response in
            // Access the HTTPURLResponse
            if let httpResponse = response.response {
                // Check if the response is a redirect
                if (300...399).contains(httpResponse.statusCode) {
                    if let location = httpResponse.headers.value(for: "Location") {
                        // Parse the redirect URL
                        if let redirectURL = URL(string: location),
                           let urlComponents = URLComponents(url: redirectURL, resolvingAgainstBaseURL: false),
                           let pathComponents = urlComponents.queryItems {

                            // there are 4 main ways this can go:
                            // 1. it provides the "code" and we fetch apple servers in order to get the JWT (yuck)
                            // 2. It doesn't provide the code but it provides access_token, refresh_token, id_token
                            // 3. It doesn't provide a thing, reuse the JWT returned by internal apple login
                            // 4. it returns a fail

                            guard let success = (pathComponents.filter { $0.name == "success" }.first?.value) else {
                                completion(.failure(.successPathComponentNotProvided))
                                return
                            }

                            if success != "true" {
                                completion(.failure(.backendDidNotReturnSuccess(successValue: success)))
                                return
                            }

                            if let code = (pathComponents.filter { $0.name == "code" }.first?.value),
                               let clientSecret = (pathComponents.filter { $0.name == "client_secret" }.first?.value) {

                                self.exchangeCodeForTokens(clientSecret: clientSecret, code: code, completion: completion)
                                return
                            }

                            if let accessToken = (pathComponents.filter { $0.name == "access_token" }.first?.value),
                               let refreshToken = (pathComponents.filter { $0.name == "refresh_token" }.first?.value),
                               let idToken = (pathComponents.filter { $0.name == "id_token" }.first?.value) {

                                do {
                                    try self.persistState(idToken: idToken, refreshToken: refreshToken, accessToken: accessToken)
                                    let appleResponse = AppleProviderResponse(
                                        accessToken: AccessTokenApple(
                                            token: accessToken,
                                            expiresIn: 3600,  // Default 1 hour
                                            refreshToken: refreshToken
                                        ),
                                        profile: AppleProfile(
                                            user: "",
                                            email: nil,
                                            givenName: nil,
                                            familyName: nil
                                        ),
                                        idToken: idToken,
                                        authorizationCode: nil
                                    )
                                    completion(.success(appleResponse))
                                    return
                                } catch {
                                    completion(.failure(.specificJsonWritingError(error)))
                                    return
                                }
                            }

                            if (pathComponents.filter { $0.name == "ios_no_code" }).first != nil {
                                let appleResponse = AppleProviderResponse(
                                    accessToken: AccessTokenApple(
                                        token: "",
                                        expiresIn: 3600,  // Default 1 hour
                                        refreshToken: nil
                                    ),
                                    profile: AppleProfile(
                                        user: "",
                                        email: email,
                                        givenName: firstName,
                                        familyName: lastName
                                    ),
                                    idToken: identityToken,
                                    authorizationCode: nil
                                )

                                do {
                                    try self.persistState(idToken: identityToken, refreshToken: "", accessToken: "")
                                    completion(.success(appleResponse))
                                    return
                                } catch {
                                    completion(.failure(AppleProviderError.specificJsonWritingError(error)))
                                    return
                                }
                            }

                        } else {
                            completion(.failure(.pathComponentsNotFound))
                            return
                        }
                    } else {
                        completion(.failure(.noLocationHeader))
                        return
                    }
                } else {
                    completion(.failure(.invalidResponseCode(statusCode: httpResponse.statusCode)))
                }
            } else if let error = response.error {
                completion(.failure(.responseError(error)))
            } else {
                completion(.failure(.unknownError))
            }
        }
    }

    func exchangeCodeForTokens(clientSecret: String, code: String, completion: @escaping ((Result<AppleProviderResponse, AppleProviderError>) -> Void)) {
        // Prepare the parameters
        let parameters: [String: String] = [
            "client_id": Bundle.main.bundleIdentifier ?? "", // TODO: implement better handling when client_id = null
            "client_secret": clientSecret, // Implement this function to generate the client secret
            "code": code,
            "grant_type": "authorization_code"
        ]

        AF.request(
            TOKEN_URL,
            method: .post,
            parameters: parameters,
            encoder: URLEncodedFormParameterEncoder.default
        )
        .validate(statusCode: 200..<300) // Ensure the response status code is in the 200-299 range
        .responseDecodable(of: TokenResponse.self) { response in
            switch response.result {
            case .success(let tokenResponse):
                // Extract tokens from the response
                guard let accessToken = tokenResponse.access_token else {
                    completion(.failure(.missingAccessToken))
                    return
                }
                guard let expiresIn = tokenResponse.expires_in else {
                    completion(.failure(.missingExpiresIn))
                    return
                }
                guard let refreshToken = tokenResponse.refresh_token else {
                    completion(.failure(.missingRefreshToken))
                    return
                }
                guard let idToken = tokenResponse.id_token else {
                    completion(.failure(.missingIdToken))
                    return
                }

                // Decode the ID token to extract the user ID
                let idTokenParts = idToken.split(separator: ".")
                if idTokenParts.count >= 2 {
                    let encodedUserID = String(idTokenParts[1])

                    // Pad the base64 string if necessary
                    let remainder = encodedUserID.count % 4
                    var base64String = encodedUserID
                    if remainder > 0 {
                        base64String += String(repeating: "=", count: 4 - remainder)
                    }

                    // Decode the base64 string
                    if let decodedData = Data(base64Encoded: base64String, options: []),
                       let userData = try? JSONSerialization.jsonObject(with: decodedData, options: []) as? [String: Any],
                       let userId = userData["sub"] as? String {
                        // Create the response object
                        let appleResponse = AppleProviderResponse(
                            accessToken: AccessTokenApple(token: accessToken, expiresIn: expiresIn, refreshToken: refreshToken),
                            profile: AppleProfile(
                                user: userId,
                                email: nil, // You might want to extract this from the idToken if available
                                givenName: nil,
                                familyName: nil
                            ),
                            idToken: idToken,
                            authorizationCode: nil
                        )

                        do {
                            try self.persistState(idToken: idToken, refreshToken: refreshToken, accessToken: accessToken)
                        } catch {
                            completion(.failure(.specificJsonWritingError(error)))
                            return
                        }

                        // Call the completion handler with the response
                        completion(.success(appleResponse))
                    } else {
                        completion(.failure(.missingUserId))
                    }
                } else {
                    completion(.failure(.invalidIdToken))
                }
            case .failure(let error):
                if let statusCode = response.response?.statusCode {
                    print("Apple token exchange failed with HTTP status \(statusCode): \(error.localizedDescription)")
                    completion(.failure(.invalidResponseCode(statusCode: statusCode)))
                } else {
                    completion(.failure(.responseError(error)))
                }
            }
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        finish(.failure(error))
    }

    // MARK: - ASAuthorizationControllerPresentationContextProviding

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return presentationWindow ?? resolvePresentationWindow() ?? ASPresentationAnchor()
    }

    private func persistName(userId: String, givenName: String?, familyName: String?) {
        if givenName == nil && familyName == nil { return }

        var names = UserDefaults.standard.dictionary(forKey: USER_INFO_KEY) as? [String: [String: String]] ?? [:]
        names[userId] = [
            "givenName": givenName ?? "",
            "familyName": familyName ?? ""
        ]
        UserDefaults.standard.set(names, forKey: USER_INFO_KEY)
    }

    private func retrieveName(userId: String) -> (givenName: String?, familyName: String?)? {
        guard let names = UserDefaults.standard.dictionary(forKey: USER_INFO_KEY) as? [String: [String: String]],
              let userNames = names[userId] else {
            return nil
        }
        return (userNames["givenName"], userNames["familyName"])
    }
}
#else
// Stub class when Alamofire is not available
class AppleProvider: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    var idToken: String?
    var refreshToken: String?
    var accessToken: String?

    func initialize(redirectUrl: String? = nil, useProperTokenExchange: Bool = false) {
        fatalError("Apple Sign-In is not available. Include Alamofire dependency in your Podfile.")
    }

    func setPresentationWindow(_ window: UIWindow?) {}

    func login(payload: [String: Any], completion: @escaping (Result<AppleProviderResponse, Error>) -> Void) {
        completion(.failure(NSError(domain: "AppleProvider", code: -1, userInfo: [NSLocalizedDescriptionKey: "Alamofire is not available. Include Alamofire dependency in your Podfile."])))
    }

    func logout(completion: @escaping (Result<Void, Error>) -> Void) {
        completion(.failure(NSError(domain: "AppleProvider", code: -1, userInfo: [NSLocalizedDescriptionKey: "Alamofire is not available. Include Alamofire dependency in your Podfile."])))
    }

    func refresh(completion: @escaping (Result<Void, Error>) -> Void) {
        completion(.failure(NSError(domain: "AppleProvider", code: -1, userInfo: [NSLocalizedDescriptionKey: "Alamofire is not available. Include Alamofire dependency in your Podfile."])))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {}
    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {}
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return ASPresentationAnchor()
    }
}
#endif
