(() => {
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  async function open() {
    if(document.getElementById('sofia-projects'))return;
    const dialog=node('dialog');dialog.id='sofia-projects';dialog.style.cssText='width:680px;max-width:92vw;max-height:85dvh;overflow:auto;background:#171722;color:white;border:0;border-radius:16px;padding:20px';
    const heading=node('h2','Gemeinsame Vorhaben'),intro=node('p','Hier sammeln wir Ziele, Entscheidungen und offene Fragen. Aufgaben kannst du ausdrücklich zuordnen.');
    const close=node('button','Schließen');close.type='button';close.onclick=()=>dialog.close();
    const feedback=node('p','Vorhaben werden geladen …');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    const list=node('div'),create=node('form'),title=node('input'),add=node('button','Vorhaben anlegen');title.maxLength=100;title.required=true;title.minLength=3;title.placeholder='Name des Vorhabens';title.setAttribute('aria-label','Name des Vorhabens');add.type='submit';add.disabled=true;create.append(title,add);
    const bottom=node('button','Schließen');bottom.type='button';bottom.onclick=()=>dialog.close();
    dialog.append(heading,close,intro,create,feedback,list,bottom);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();close.focus();
    let state=null,availableTasks=[],busy=false;
    async function reload(){const r=await fetch('/api/memory',{credentials:'same-origin',cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Die Vorhaben konnten nicht geladen werden.');state=d.projects||{revision:0,selectedId:null,items:[],tasks:[]};add.disabled=false;render();}
    async function change(operation,extra={}) {
      if(busy||!state)return;busy=true;add.disabled=true;
      try {const r=await fetch('/api/memory',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:'project',revision:state.revision,operation,...extra})});const d=await r.json();if(!r.ok){if(r.status===409)await reload();throw Error(d.error||'Die Änderung wurde nicht bestätigt.');}state=d.projects;render();feedback.textContent='Vorhaben gespeichert.';}
      catch(e){feedback.textContent=e.message;}finally{busy=false;add.disabled=!state;}
    }
    create.onsubmit=async event=>{event.preventDefault();const value=title.value.trim();if(value.length<3){feedback.textContent='Bitte einen Namen mit mindestens drei Zeichen eingeben.';return;}await change('create',{value});if(state?.items.some(p=>p.title.toLowerCase()===value.toLowerCase()))title.value='';};
    const labels={goals:'Ziele',decisions:'Entscheidungen',questions:'Offene Fragen'};
    function action(text,operation,extra){const button=node('button',text);button.type='button';button.onclick=()=>change(operation,extra);return button;}
    function render() {
      list.replaceChildren();if(!state.items.length){list.append(node('p','Noch kein gemeinsames Vorhaben angelegt.'));return;}
      const ordered=[...state.items].sort((a,b)=>Number(b.id===state.selectedId)-Number(a.id===state.selectedId));
      for(const project of ordered){
        const card=node('section');card.style.cssText='margin:16px 0;padding:14px;border:1px solid #454555;border-radius:12px';
        const status=({active:'In Arbeit',paused:'Pausiert',completed:'Abgeschlossen'})[project.status]||project.status;
        card.append(node('h3',project.title),node('p',status+(project.id===state.selectedId?' · Ausgewählt':'')));
        const controls=node('div');controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
        if(project.status==='active'){controls.append(action('Auswählen','select',{id:project.id}),action('Pausieren','pause',{id:project.id}),action('Abschließen','complete',{id:project.id}));}
        else controls.append(action('Wieder aufnehmen','resume',{id:project.id}));
        const rename=node('button','Umbenennen');rename.type='button';rename.onclick=()=>{const input=node('input');input.value=project.title;input.maxLength=100;input.setAttribute('aria-label','Neuer Name des Vorhabens');const save=action('Namen speichern','rename',{id:project.id});save.onclick=()=>change('rename',{id:project.id,value:input.value});rename.replaceWith(input,save);input.focus();};controls.append(rename);card.append(controls);
        for(const [field,label] of Object.entries(labels)){
          card.append(node('h4',label));const entries=node('ul');
          for(const value of project[field]){const item=node('li'),text=node('span',value),remove=action('Entfernen','remove_note',{id:project.id,field,value});remove.setAttribute('aria-label',label+': '+value+' entfernen');item.append(text,' ',remove);entries.append(item);}card.append(entries);
          if(project.status==='active'){const form=node('form'),input=node('input'),save=node('button','Hinzufügen');input.maxLength=300;input.required=true;input.placeholder=label==='Ziele'?'Ein Ziel festhalten':label==='Entscheidungen'?'Eine Entscheidung festhalten':'Eine offene Frage festhalten';input.setAttribute('aria-label',label+' für '+project.title);save.type='submit';form.append(input,save);form.onsubmit=event=>{event.preventDefault();void change('add_note',{id:project.id,field,value:input.value});};card.append(form);}
        }
        card.append(node('h4','Verknüpfte Aufgaben'));const tasks=node('ul');
        for(const id of project.taskIds){const task=state.tasks?.find(t=>t.id===id),item=node('li');item.append(node('span',task?task.title+' · '+(task.status==='done'?'Erledigt':'Offen'):'Aufgabe nicht mehr vorhanden'),' ',action('Zuordnung entfernen','unlink_task',{id:project.id,taskId:id}));tasks.append(item);}card.append(tasks);
        const openTasks=(state.tasks||[]).filter(t=>project.taskIds.includes(t.id)&&t.status==='open');
        card.append(node('p',project.status==='active'?'Nächster möglicher Schritt: '+(openTasks[0]?.title||project.questions[0]||project.goals[0]||'ein Ziel festlegen')+'.':'Dieses Vorhaben ruht. Wiederaufnahme nur auf deinen Wunsch.'));
        if(project.status==='active'&&availableTasks.length){const choice=node('select');choice.setAttribute('aria-label','Aufgabe für '+project.title+' auswählen');const empty=node('option','Vorhandene Aufgabe auswählen');empty.value='';choice.append(empty);for(const task of availableTasks.filter(t=>!project.taskIds.includes(t.id))){const option=node('option',task.title+(task.status==='done'?' · erledigt':''));option.value=task.id;choice.append(option);}const link=node('button','Aufgabe zuordnen');link.type='button';link.onclick=()=>{if(choice.value)void change('link_task',{id:project.id,taskId:choice.value});};card.append(choice,link);}
        list.append(card);
      }
    }
    try{await reload();feedback.textContent='Vorhaben sind geladen.';const r=await fetch('/api/tasks?status=all',{credentials:'same-origin',cache:'no-store'});if(r.ok){const d=await r.json();availableTasks=Array.isArray(d.tasks)?d.tasks:[];render();}}
    catch(e){feedback.textContent=e.message;}
  }
  window.SofiaProjects={open};
})();
