# Render 배포 방법

## 1. Render에서 서비스 생성

1. Render에 GitHub 계정으로 로그인한다.
2. `New` -> `Blueprint`를 선택한다.
3. GitHub 저장소 `ziagilove-ui/InventoryManagement`를 선택한다.
4. `render.yaml` 설정으로 서비스를 생성한다.

## 2. 필수 환경변수

Render 서비스의 `Environment` 메뉴에서 아래 값을 입력한다.

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
INITIAL_ADMIN_EMAIL
GOOGLE_SERVICE_ACCOUNT_JSON
GOOGLE_SHEET_ID
GOOGLE_SHEET_RANGE
```

`SESSION_SECRET_KEY`는 Render가 자동 생성한다.

## 3. Google OAuth 리디렉션 URI

Render 배포 주소가 예를 들어 아래와 같다면:

```text
https://inventory-management.onrender.com
```

Google Cloud Console의 OAuth 클라이언트에 아래 URI를 추가한다.

```text
https://inventory-management.onrender.com/auth/google/callback
```

로컬 테스트용 URI도 함께 유지할 수 있다.

```text
http://127.0.0.1:8000/auth/google/callback
```

## 4. 접속 주소

배포 후 사용자는 Render 주소로 접속한다.

```text
https://inventory-management.onrender.com
```

GitHub 주소는 코드 저장소이며, 실제 앱 접속 주소가 아니다.
