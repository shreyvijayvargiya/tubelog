import numpy as np, wave
sr=44100; D=float("85.320000"); n=int(sr*D); t=np.arange(n)/sr
bpm=108; beat=60/bpm
def env(x,a=.01,r=.2): return np.minimum(1,x/a)*np.exp(-x/r)
out=np.zeros(n)
# chord progression Am - F - C - G, 4 beats*2 each
roots=[57,53,60,55]; chords=[[0,3,7],[0,4,7],[0,4,7],[0,4,7]]
mid=lambda m:440*2**((m-69)/12)
bar=beat*4
for i in range(int(D/bar)+1):
    r=roots[i%4]; ch=[0,3,7] if i%4==0 else [0,4,7]
    s=int(i*bar*sr); L=min(int(bar*sr),n-s)
    if L<=0: break
    tt=np.arange(L)/sr
    pad=sum(np.sin(2*np.pi*mid(r+c)*tt)+.5*np.sin(4*np.pi*mid(r+c)*tt)*.3 for c in ch)
    pad*=np.minimum(1,tt/.3)*np.minimum(1,(bar-tt)/.3)*.08
    out[s:s+L]+=pad
    bass=np.sin(2*np.pi*mid(r-24)*tt)*.28*(0.6+0.4*np.exp(-(tt%beat)/.15))
    out[s:s+L]+=bass
    # arpeggio 8ths
    for k in range(8):
        a=int((k*beat/2)*sr)
        if a>=L: break
        note=mid(r+12+ch[k%3]+(12 if k%4==3 else 0)); m=min(int(.4*sr),L-a)
        x=np.arange(m)/sr
        out[s+a:s+a+m]+=np.sin(2*np.pi*note*x)*env(x,.005,.12)*.12
    # kick on beats, hat on offbeats (after 4s)
    if s/sr>=4:
        for k in range(4):
            a=int(k*beat*sr); m=min(int(.25*sr),L-a)
            if m<=0: continue
            x=np.arange(m)/sr
            out[s+a:s+a+m]+=np.sin(2*np.pi*(50+90*np.exp(-x*30))*x)*np.exp(-x/.09)*.5
            h=int((k+.5)*beat*sr); m=min(int(.05*sr),L-h)
            if m>0: out[s+h:s+h+m]+=np.random.randn(m)*np.exp(-np.arange(m)/sr/.015)*.05
# fade in/out, normalize
out*=np.minimum(1,t/2)*np.minimum(1,(D-t)/3)
out=np.tanh(out*1.2); out/=np.abs(out).max()/0.85
w=wave.open('music.wav','wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((out*32767).astype(np.int16).tobytes()); w.close()
